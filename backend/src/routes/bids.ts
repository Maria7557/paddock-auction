import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import {
  ensureAuctionDepositLock,
  releaseAuctionDepositLocks,
} from "../lib/auction-deposit-locks";
import {
  hydrateAuthIfPresent,
  requireActiveBuyerAccount,
  requireAuth,
  type BuyerAccessContext,
} from "../lib/auth";
import { sendOutbidEmail } from "../lib/email";
import { executePlaceBidCommand } from "../modules/bidding/application/place_bid";
import {
  evaluateVipAccess,
  loadVipRequestActorBase,
  readTrustedCurrentTime,
  type VipRequestActorBase,
} from "../lib/vip-early-access";
import { notifyEventRuntime } from "./auction-events";
import { publishAuctionRealtimeSnapshot } from "./auction-ws";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
    };

type JsonRecord = Record<string, unknown>;

type BidderCompanySummary = {
  id: string;
  name: string;
  country: string;
};

type BidderUserSummary = {
  id: string;
  emirate: string | null;
};

type AuctionLockRow = {
  id: string;
  state: string;
  version: number;
  current_price: DecimalLike;
  starts_at: Date | string;
  min_increment: DecimalLike;
  buy_now_price: DecimalLike | null;
  seller_company_id: string;
  approved_at: Date | string | null;
  vip_access_policy: string | null;
  vip_release_at: Date | string | null;
  last_bid_sequence: number;
  ends_at: Date | string;
};

const SELLER_DECISION_WINDOW_HOURS = 24;
const PUBLIC_AUCTION_STATES = ["SCHEDULED", "LIVE", "EXTENDED"] as const;

const placeBidSchema = z.object({
  auctionId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  idempotencyKey: z.string().trim().min(1),
});

const auctionParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const listAuctionsQuerySchema = z.object({
  vipEarlyAccess: z.enum(["active"]).optional(),
  maxYear: z.coerce.number().int().min(2000).max(2026).optional(),
});

const auctionBidsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
});

async function computeBidRequestExpiry(referenceDate: Date): Promise<Date> {
  const expiresAt = new Date(referenceDate);

  expiresAt.setUTCDate(expiresAt.getUTCDate() + 90);

  return expiresAt;
}

async function createBidRequestHash(input: {
  auctionId: string;
  amount: number;
  companyId: string;
  userId: string;
}): Promise<string> {
  return createHash("sha256")
    .update(
      JSON.stringify({
        auctionId: input.auctionId,
        amount: input.amount,
        companyId: input.companyId,
        userId: input.userId,
      }),
    )
    .digest("hex");
}

async function toNumberValue(value: DecimalLike): Promise<number> {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  throw new Error("Unable to convert value to number");
}

async function toOptionalNumberValue(value: DecimalLike | null | undefined): Promise<number | null> {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return await toNumberValue(value);
  } catch {
    return null;
  }
}

async function toIsoString(value: Date | string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Unable to convert value to date");
  }

  return parsed.toISOString();
}

async function toDateValue(value: Date | string): Promise<Date> {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Unable to convert value to date");
  }

  return parsed;
}

async function addHours(base: Date, hours: number): Promise<Date> {
  const next = new Date(base);

  next.setUTCHours(next.getUTCHours() + hours);

  return next;
}

async function readStoredResponseBody(value: unknown): Promise<JsonRecord> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function readJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function readJsonString(record: JsonRecord | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readJsonNumber(record: JsonRecord | null | undefined, key: string): number | null {
  const value = record?.[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

async function readLatestVehicleOverrideMap(vehicleIds: string[]): Promise<Map<string, JsonRecord>> {
  if (vehicleIds.length === 0) {
    return new Map();
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      action: "ADMIN_VEHICLE_UPDATED",
      entityType: "Vehicle",
      entityId: {
        in: vehicleIds,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      entityId: true,
      payload: true,
    },
  });

  const overrideByVehicleId = new Map<string, JsonRecord>();

  for (const log of logs) {
    if (overrideByVehicleId.has(log.entityId)) {
      continue;
    }

    const payload = await readStoredResponseBody(log.payload);
    const changes = await readStoredResponseBody(payload.changes);

    overrideByVehicleId.set(log.entityId, changes);
  }

  return overrideByVehicleId;
}

async function toStoredJson(value: unknown): Promise<Prisma.InputJsonValue> {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function serializeBuyNowPrice(
  value: DecimalLike | null,
): Promise<number | null> {
  return toOptionalNumberValue(value);
}

async function sendValidationError(
  reply: FastifyReply,
  issues: Array<{ path: string; message: string }>,
): Promise<void> {
  await reply.code(400).send({
    error: "Invalid request",
    issues,
  });
}

function isPublicAuctionState(state: string): state is (typeof PUBLIC_AUCTION_STATES)[number] {
  return PUBLIC_AUCTION_STATES.includes(state as (typeof PUBLIC_AUCTION_STATES)[number]);
}

async function mapBidError(error: unknown): Promise<{
  statusCode: number;
  body: JsonRecord;
  bidRequestStatus: "REJECTED" | "FAILED";
}> {
  if (error instanceof Error && error.message === "AUCTION_NOT_LIVE") {
    return {
      statusCode: 409,
      body: {
        error: "Auction is not active",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "BID_TOO_LOW") {
    return {
      statusCode: 422,
      body: {
        error: "Bid must be higher than current price",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "BID_INCREMENT_VIOLATION") {
    return {
      statusCode: 422,
      body: {
        error: "Bid must meet the minimum increment",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "AUCTION_ENDED") {
    return {
      statusCode: 409,
      body: {
        error: "Auction has ended",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "NO_DEPOSIT") {
    return {
      statusCode: 403,
      body: {
        error: "Deposit required to bid",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "VIP_EARLY_ACCESS_RESTRICTED") {
    return {
      statusCode: 403,
      body: {
        error: "Lot is unavailable right now",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  return {
    statusCode: 500,
    body: {
      error: "Internal server error",
    },
    bidRequestStatus: "FAILED",
  };
}

async function serializeBid(bid: {
  id: string;
  amount: DecimalLike;
  sequenceNo: number;
  createdAt: Date;
  auctionId?: string;
  companyId?: string;
  userId?: string;
}): Promise<JsonRecord> {
  return {
    id: bid.id,
    ...(bid.auctionId ? { auctionId: bid.auctionId } : {}),
    ...(bid.companyId ? { companyId: bid.companyId } : {}),
    ...(bid.userId ? { userId: bid.userId } : {}),
    amount: await toNumberValue(bid.amount),
    sequenceNo: bid.sequenceNo,
    createdAt: bid.createdAt.toISOString(),
  };
}

function normalizeCountryLabel(country: string | null | undefined): string {
  const value = country?.trim();

  if (!value) {
    return "UAE";
  }

  const normalized = value.toLowerCase();

  if (normalized === "united arab emirates" || normalized === "uae" || normalized === "u.a.e.") {
    return "UAE";
  }

  if (
    normalized === "united states" ||
    normalized === "united states of america" ||
    normalized === "usa" ||
    normalized === "u.s.a."
  ) {
    return "USA";
  }

  return value;
}

function countryToFlag(country: string | null | undefined): string {
  const normalized = country?.trim().toLowerCase() ?? "";
  const codeMap = new Map<string, string>([
    ["uae", "AE"],
    ["u.a.e.", "AE"],
    ["united arab emirates", "AE"],
    ["saudi arabia", "SA"],
    ["ksa", "SA"],
    ["qatar", "QA"],
    ["kuwait", "KW"],
    ["oman", "OM"],
    ["bahrain", "BH"],
    ["united states", "US"],
    ["united states of america", "US"],
    ["usa", "US"],
    ["u.s.a.", "US"],
    ["canada", "CA"],
    ["united kingdom", "GB"],
    ["uk", "GB"],
    ["great britain", "GB"],
    ["egypt", "EG"],
    ["jordan", "JO"],
    ["lebanon", "LB"],
  ]);

  const code = codeMap.get(normalized);

  if (!code) {
    return "";
  }

  return Array.from(code.toUpperCase())
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function buildCompanyInitials(name: string | null | undefined): string {
  const cleaned = name?.trim();

  if (!cleaned) {
    return "MK";
  }

  const parts = cleaned
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return cleaned.slice(0, 2).toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

const LUXURY_BRANDS = new Set([
  "Audi",
  "Bentley",
  "BMW",
  "Cadillac",
  "Genesis",
  "Infiniti",
  "Lamborghini",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Mercedes-Benz",
  "Porsche",
  "Range Rover",
  "Tesla",
]);

const BRAND_ORIGIN_MAP: Record<string, string> = {
  Audi: "Germany",
  Bentley: "United Kingdom",
  BMW: "Germany",
  Cadillac: "United States",
  Chevrolet: "United States",
  Ford: "United States",
  Genesis: "South Korea",
  Honda: "Japan",
  Hyundai: "South Korea",
  Infiniti: "Japan",
  Jeep: "United States",
  Kia: "South Korea",
  Lamborghini: "Italy",
  "Land Rover": "United Kingdom",
  Lexus: "Japan",
  Lincoln: "United States",
  "Mercedes-Benz": "Germany",
  Nissan: "Japan",
  Porsche: "Germany",
  "Range Rover": "United Kingdom",
  Tesla: "United States",
  Toyota: "Japan",
  Volkswagen: "Germany",
};

const FEATURE_KEYWORDS = new Map<string, string[]>([
  ["adaptive cruise", ["Adaptive Cruise Control"]],
  ["blind spot", ["Blind Spot Monitor"]],
  ["camera", ["Reverse Camera", "360 Camera"]],
  ["carplay", ["Apple CarPlay"]],
  ["cool", ["Cooled Seats"]],
  ["heated", ["Heated Seats"]],
  ["lane", ["Lane Assist"]],
  ["leather", ["Leather Seats"]],
  ["nav", ["Navigation"]],
  ["parking", ["Parking Sensors"]],
  ["roof", ["Sunroof"]],
  ["sensor", ["Parking Sensors"]],
  ["theatre", ["Digital Displays"]],
  ["ventilat", ["Cooled Seats"]],
]);

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function getConditionGrade(condition: string | null | undefined): "A" | "B" | "C" | "D" {
  const normalized = normalizeText(condition).toLowerCase();

  if (!normalized) {
    return "D";
  }

  if (normalized.includes("excellent") || normalized.includes("new") || normalized.includes("mint")) {
    return "A";
  }

  if (normalized.includes("good")) {
    return "B";
  }

  if (normalized.includes("fair") || normalized.includes("used")) {
    return "C";
  }

  return "D";
}

function getPrimaryDamage(damage: string | null | undefined): string {
  const normalized = normalizeText(damage);

  return normalized && normalized.toLowerCase() !== "none" ? normalized : "None";
}

function getStartCode(input: {
  damage: string | null | undefined;
  condition: string | null | undefined;
}): "Run & Drive" | "Stationary" {
  const damage = normalizeText(input.damage).toLowerCase();
  const condition = normalizeText(input.condition).toLowerCase();
  const stationaryKeywords = ["flood", "frame", "rollover", "burn", "biohazard", "non-runner", "stationary"];

  if (stationaryKeywords.some((keyword) => damage.includes(keyword) || condition.includes(keyword))) {
    return "Stationary";
  }

  return "Run & Drive";
}

function getTitleStatus(damage: string | null | undefined): string {
  const normalized = normalizeText(damage).toLowerCase();

  if (!normalized || normalized === "none") {
    return "Clean";
  }

  if (normalized.includes("major") || normalized.includes("frame") || normalized.includes("rollover")) {
    return "Salvage";
  }

  return "Clean";
}

function getNumberOfKeys(input: {
  condition: string | null | undefined;
  startCode: "Run & Drive" | "Stationary";
}): number {
  if (input.startCode === "Stationary") {
    return 1;
  }

  const grade = getConditionGrade(input.condition);

  if (grade === "A") {
    return 2;
  }

  if (grade === "B") {
    return 1;
  }

  return 0;
}

function getWarrantyStatus(input: {
  year: number;
  serviceHistory: string | null | undefined;
  description: string | null | undefined;
}): "ACTIVE" | "EXPIRED" | "NONE" {
  const currentYear = new Date().getUTCFullYear();
  const combined = `${normalizeText(input.serviceHistory)} ${normalizeText(input.description)}`.toLowerCase();
  const yearMatch = combined.match(/20\d{2}/);
  const explicitYear = yearMatch ? Number(yearMatch[0]) : null;

  if (combined.includes("warranty")) {
    if (explicitYear && explicitYear >= currentYear) {
      return "ACTIVE";
    }

    return input.year >= currentYear - 2 ? "ACTIVE" : "EXPIRED";
  }

  if (input.year >= currentYear - 2) {
    return "ACTIVE";
  }

  if (input.year >= currentYear - 5) {
    return "EXPIRED";
  }

  return "NONE";
}

function getTireCondition(input: { mileage: number; year: number }): number {
  const agePenalty = Math.max(0, (new Date().getUTCFullYear() - input.year) * 5);
  const mileagePenalty = Math.floor(input.mileage / 6_000);

  return Math.max(38, Math.min(96, 94 - agePenalty - mileagePenalty));
}

function getManufacturedIn(brand: string | null | undefined): string {
  return BRAND_ORIGIN_MAP[normalizeText(brand)] ?? "International";
}

function getSeries(model: string | null | undefined): string | null {
  const value = normalizeText(model);
  const parts = value.split(" ");

  if (parts.length <= 1) {
    return null;
  }

  return parts.slice(1).join(" ");
}

function buildFeatureSet(vehicle: {
  brand: string;
  model: string;
  year: number;
  bodyType: string | null;
  transmission: string | null;
  condition: string | null;
  description: string | null;
  serviceHistory: string | null;
  airbags: string | null;
}): string[] {
  const features = new Set<string>();
  const grade = getConditionGrade(vehicle.condition);
  const normalizedBodyType = normalizeText(vehicle.bodyType).toLowerCase();
  const searchText = `${normalizeText(vehicle.model)} ${normalizeText(vehicle.description)} ${normalizeText(vehicle.serviceHistory)}`.toLowerCase();

  if (normalizeText(vehicle.airbags)) {
    features.add("Airbags");
    features.add("ABS");
  }

  if (normalizeText(vehicle.transmission).toLowerCase().includes("auto")) {
    features.add("Automatic Climate Control");
  }

  if (vehicle.year >= 2021) {
    features.add("LED Headlights");
    features.add("Reverse Camera");
    features.add("Parking Sensors");
  }

  if (vehicle.year >= 2022) {
    features.add("Apple CarPlay");
    features.add("Digital Displays");
  }

  if (vehicle.year >= 2023 && (grade === "A" || grade === "B")) {
    features.add("Blind Spot Monitor");
    features.add("Adaptive Cruise Control");
    features.add("Lane Assist");
  }

  if (normalizedBodyType === "suv" || normalizedBodyType === "van") {
    features.add("Rear AC Vents");
  }

  if (LUXURY_BRANDS.has(vehicle.brand) || searchText.includes("vip") || searchText.includes("platinum")) {
    features.add("Leather Seats");
    features.add("Navigation");
    features.add("Power Seats");
    features.add("Sunroof");
    features.add("360 Camera");
  }

  for (const [keyword, mappedFeatures] of FEATURE_KEYWORDS.entries()) {
    if (!searchText.includes(keyword)) {
      continue;
    }

    mappedFeatures.forEach((feature) => features.add(feature));
  }

  return Array.from(features);
}

function buildBidLocationLabel(city: string | null | undefined, country: string | null | undefined): string {
  const cityValue = city?.trim();
  const countryLabel = normalizeCountryLabel(country);

  if (cityValue && cityValue.toLowerCase() !== countryLabel.toLowerCase()) {
    return `${cityValue}, ${countryLabel}`;
  }

  return countryLabel;
}

async function serializeBidHistoryEntry(
  bid: {
    id: string;
    amount: DecimalLike;
    sequenceNo: number;
    createdAt: Date;
    auctionId: string;
    companyId: string;
    userId: string;
  },
  input: {
    viewerCompanyId: string | null;
    companyById: Map<string, BidderCompanySummary>;
    userById: Map<string, BidderUserSummary>;
  },
): Promise<JsonRecord> {
  const company = input.companyById.get(bid.companyId);
  const user = input.userById.get(bid.userId);
  const companyName = company?.name?.trim() || "Market bidder";
  const country = company?.country?.trim() || "United Arab Emirates";
  const city = user?.emirate?.trim() || null;

  return {
    ...(await serializeBid(bid)),
    companyName,
    companyInitials: buildCompanyInitials(companyName),
    country,
    city,
    locationLabel: buildBidLocationLabel(city, country),
    flag: countryToFlag(country),
    isMine: input.viewerCompanyId === bid.companyId,
  };
}

async function serializeVehicle(vehicle: {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
  marketPrice?: DecimalLike | null;
  estimatedValue?: DecimalLike | null;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  regionSpec: string | null;
  condition: string | null;
  serviceHistory: string | null;
  description: string | null;
  conditionGrade?: string | null;
  primaryDamage?: string | null;
  titleStatus?: string | null;
  tireCondition?: number | null;
  numberOfKeys?: number | null;
  warrantyStatus?: string | null;
  startCode?: string | null;
  manufacturedIn?: string | null;
  series?: string | null;
  features?: unknown;
  engine: string | null;
  driveType: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  airbags: string | null;
  damage: string | null;
  damageMap: unknown;
  images: string[];
}, adminOverride: JsonRecord | null = null): Promise<JsonRecord> {
  const marketPriceSource = vehicle.marketPrice ?? vehicle.estimatedValue ?? null;
  const marketPrice = await toOptionalNumberValue(marketPriceSource);
  const featureOverrides = readJsonRecord(adminOverride?.features);
  const conditionGrade =
    readJsonString(adminOverride, "conditionGrade") ??
    (typeof vehicle.conditionGrade === "string" && vehicle.conditionGrade.trim().length > 0
      ? vehicle.conditionGrade
      : getConditionGrade(vehicle.condition));
  const primaryDamage =
    readJsonString(adminOverride, "primaryDamage") ??
    (typeof vehicle.primaryDamage === "string" && vehicle.primaryDamage.trim().length > 0
      ? vehicle.primaryDamage
      : getPrimaryDamage(vehicle.damage));
  const startCode =
    readJsonString(adminOverride, "startCode") ??
    (typeof vehicle.startCode === "string" && vehicle.startCode.trim().length > 0
      ? vehicle.startCode
      : getStartCode({
          damage: vehicle.damage,
          condition: vehicle.condition,
        }));
  const titleStatus =
    readJsonString(adminOverride, "titleStatus") ??
    (typeof vehicle.titleStatus === "string" && vehicle.titleStatus.trim().length > 0
      ? vehicle.titleStatus
      : getTitleStatus(vehicle.damage));
  const tireCondition =
    readJsonNumber(adminOverride, "tireCondition") ??
    (typeof vehicle.tireCondition === "number" && Number.isFinite(vehicle.tireCondition)
      ? vehicle.tireCondition
      : getTireCondition({
          mileage: vehicle.mileage,
          year: vehicle.year,
        }));
  const numberOfKeys =
    readJsonNumber(adminOverride, "numberOfKeys") ??
    (typeof vehicle.numberOfKeys === "number" && Number.isFinite(vehicle.numberOfKeys)
      ? vehicle.numberOfKeys
      : getNumberOfKeys({
          condition: vehicle.condition,
          startCode,
        }));
  const warrantyStatus =
    readJsonString(adminOverride, "warrantyStatus") ??
    (typeof vehicle.warrantyStatus === "string" && vehicle.warrantyStatus.trim().length > 0
      ? vehicle.warrantyStatus
      : getWarrantyStatus({
          year: vehicle.year,
          serviceHistory: vehicle.serviceHistory,
          description: vehicle.description,
        }));
  const manufacturedIn =
    readJsonString(adminOverride, "manufacturedIn") ??
    (typeof vehicle.manufacturedIn === "string" && vehicle.manufacturedIn.trim().length > 0
      ? vehicle.manufacturedIn
      : getManufacturedIn(vehicle.brand));
  const series =
    readJsonString(adminOverride, "series") ??
    (typeof vehicle.series === "string" && vehicle.series.trim().length > 0
      ? vehicle.series
      : getSeries(vehicle.model));
  const features = featureOverrides ?? (vehicle.features ?? buildFeatureSet(vehicle));

  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
    marketPrice,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    bodyType: vehicle.bodyType,
    regionSpec: vehicle.regionSpec,
    condition: vehicle.condition,
    conditionGrade,
    primaryDamage,
    titleStatus,
    tireCondition,
    numberOfKeys,
    warrantyStatus,
    serviceHistory: vehicle.serviceHistory,
    description: vehicle.description,
    engine: vehicle.engine,
    driveType: vehicle.driveType,
    startCode,
    manufacturedIn,
    series,
    estimatedValue: readJsonNumber(adminOverride, "estimatedValueAed") ?? marketPrice,
    features,
    exteriorColor: vehicle.exteriorColor,
    interiorColor: vehicle.interiorColor,
    airbags: vehicle.airbags,
    damage: vehicle.damage,
    damageMap: vehicle.damageMap,
    images: vehicle.images,
  };
}

function createBuyerActorBase(
  buyerAccess: BuyerAccessContext,
): VipRequestActorBase {
  return {
    userId: buyerAccess.userId,
    companyId: buyerAccess.companyId,
    role: "BUYER",
    buyerContext: buyerAccess,
  };
}

export async function bidsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/auctions",
    async function listAuctionsHandler(
      request: FastifyRequest<{ Querystring: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedQuery = listAuctionsQuerySchema.safeParse(request.query);

      if (!parsedQuery.success) {
        await sendValidationError(
          reply,
          parsedQuery.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      await hydrateAuthIfPresent(request);
      const vipEarlyAccessOnly = parsedQuery.data.vipEarlyAccess === "active";

      const [actorBase, now, auctions] = await Promise.all([
        loadVipRequestActorBase(request),
        readTrustedCurrentTime(prisma),
        prisma.auction.findMany({
          where: {
            state: {
              in: [...PUBLIC_AUCTION_STATES],
            },
            ...(parsedQuery.data.maxYear !== undefined
              ? {
                  vehicle: {
                    year: {
                      lte: parsedQuery.data.maxYear,
                    },
                  },
                }
              : {}),
            transitions: {
              none: {
                trigger: "EVENT_META",
              },
            },
          },
          include: {
            vehicle: true,
            _count: {
              select: {
                bids: true,
              },
            },
          },
          orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        }),
      ]);
      const sellerCompanyIds = Array.from(new Set(auctions.map((auction) => auction.sellerCompanyId)));
      const companies = sellerCompanyIds.length
        ? await prisma.company.findMany({
            where: {
              id: {
                in: sellerCompanyIds,
              },
            },
            select: {
              id: true,
              name: true,
              country: true,
            },
          })
        : [];
      const vehicleOverrideById = await readLatestVehicleOverrideMap(
        auctions.map((auction) => auction.vehicle.id),
      );
      const companyById = new Map(companies.map((company) => [company.id, company]));
      const accessibleItems: JsonRecord[] = [];

      for (const auction of auctions) {
        const decision = evaluateVipAccess({
          actorBase,
          snapshot: {
            approvedAt: auction.approvedAt,
            vipAccessPolicy: auction.vipAccessPolicy,
            vipReleaseAt: auction.vipReleaseAt,
            sellerCompanyId: auction.sellerCompanyId,
          },
          now,
        });

        if (vipEarlyAccessOnly) {
          if (
            decision.actorCategory !== "vip_buyer" ||
            decision.listingMode !== "FULL" ||
            decision.showVipEarlyAccessBadge !== true
          ) {
            continue;
          }
        }

        if (decision.listingMode !== "FULL") {
          continue;
        }

        const company = companyById.get(auction.sellerCompanyId) ?? null;

        accessibleItems.push({
          id: auction.id,
          state: auction.state,
          currentPrice: (await toOptionalNumberValue(auction.currentPrice)) ?? 0,
          minIncrement: (await toOptionalNumberValue(auction.minIncrement)) ?? 0,
          startingPrice: (await toOptionalNumberValue(auction.startingPrice)) ?? 0,
          buyNowPrice: await serializeBuyNowPrice(auction.buyNowPrice),
          startsAt: await toIsoString(auction.startsAt),
          endsAt: await toIsoString(auction.endsAt),
          createdAt: await toIsoString(auction.createdAt),
          sellerName: company?.name ?? "Verified Seller",
          location: company?.country ?? "UAE",
          totalBids: auction._count?.bids ?? 0,
          showVipEarlyAccessBadge: decision.showVipEarlyAccessBadge,
          vehicle: await serializeVehicle(auction.vehicle, vehicleOverrideById.get(auction.vehicle.id) ?? null),
        });
      }

      await reply.code(200).send({
        auctions: accessibleItems,
      });
    },
  );

  fastify.post(
    "/bids",
    {
      preHandler: requireAuth,
    },
    async function placeBidHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedBody = placeBidSchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(
          reply,
          parsedBody.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const buyerAccess = await requireActiveBuyerAccount(request, reply);

      if (!buyerAccess) {
        return;
      }

      if (buyerAccess.kycVerified !== true) {
        await reply.code(403).send({
          error: "KYC_PENDING",
          message: "Your account is under review.",
        });
        return;
      }

      const { userId, companyId } = buyerAccess;
      const payload = parsedBody.data;
      fastify.log.info(
        {
          auctionId: payload.auctionId,
          amount: payload.amount,
          companyId,
          userId,
        },
        "Bid placement requested",
      );
      const [now, auctionAccess] = await Promise.all([
        readTrustedCurrentTime(prisma),
        prisma.auction.findUnique({
          where: {
            id: payload.auctionId,
          },
          select: {
            id: true,
            sellerCompanyId: true,
            approvedAt: true,
            vipAccessPolicy: true,
            vipReleaseAt: true,
          },
        }),
      ]);

      if (
        auctionAccess &&
        !evaluateVipAccess({
          actorBase: createBuyerActorBase(buyerAccess),
          snapshot: {
            approvedAt: auctionAccess.approvedAt,
            vipAccessPolicy: auctionAccess.vipAccessPolicy,
            vipReleaseAt: auctionAccess.vipReleaseAt,
            sellerCompanyId: auctionAccess.sellerCompanyId,
          },
          now,
        }).canBid
      ) {
        await reply.code(403).send({
          error: "Lot is unavailable right now",
        });
        return;
      }

      const result = await executePlaceBidCommand(prisma, {
        auctionId: payload.auctionId,
        companyId,
        userId,
        amount: payload.amount,
        idempotencyKey: payload.idempotencyKey,
      });

      if (result.kind === "replay") {
        fastify.log.info(
          {
            auctionId: payload.auctionId,
            amount: payload.amount,
            companyId,
            bidId: result.bidId,
          },
          "Bid replayed from idempotency cache",
        );
      }

      if (result.kind === "success") {
        void publishAuctionRealtimeSnapshot(payload.auctionId, fastify.log);
        void notifyEventRuntime(payload.auctionId, fastify.log);
        void (async () => {
          try {
            const auction = await prisma.auction.findUnique({
              where: {
                id: payload.auctionId,
              },
              select: {
                currentPrice: true,
                bids: {
                  orderBy: [{ sequenceNo: "desc" }],
                  take: 2,
                  select: {
                    companyId: true,
                    userId: true,
                    amount: true,
                    sequenceNo: true,
                  },
                },
              },
            });

            const bids = auction?.bids ?? [];
            const previousBid = bids.find((bid) => bid.companyId !== companyId);

            if (!previousBid || !auction) {
              return;
            }

            const [previousUser, auctionDetails] = await Promise.all([
              prisma.user.findUnique({
                where: {
                  id: previousBid.userId,
                },
                select: {
                  email: true,
                },
              }),
              prisma.auction.findUnique({
                where: {
                  id: payload.auctionId,
                },
                select: {
                  vehicle: {
                    select: {
                      brand: true,
                      model: true,
                      year: true,
                    },
                  },
                },
              }),
            ]);

            if (!previousUser || !auctionDetails) {
              return;
            }

            const vehicleTitle = `${auctionDetails.vehicle.brand} ${auctionDetails.vehicle.model} ${auctionDetails.vehicle.year}`;

            await sendOutbidEmail(
              {
                email: previousUser.email,
                name: previousUser.email,
                vehicleTitle,
                currentBidAed: payload.amount,
                yourBidAed: await toNumberValue(previousBid.amount),
                auctionId: payload.auctionId,
              },
              fastify.log,
            );
          } catch {
            // Fire-and-forget email dispatch must never affect bid placement.
          }
        })();

        fastify.log.info(
          {
            auctionId: payload.auctionId,
            amount: payload.amount,
            companyId,
            userId,
            bidId: result.bidId,
          },
          "Bid placed successfully",
        );
      }

      if (result.kind === "rejected" && result.statusCode === 500) {
        fastify.log.error(
          {
            auctionId: payload.auctionId,
            amount: payload.amount,
            companyId,
            userId,
          },
          "Bid placement failed",
        );
      }

      await reply.code(result.statusCode).send(result.body);
    },
  );

  fastify.get<{
    Params: unknown;
    Querystring: unknown;
  }>(
    "/auctions/:id/bids",
    {
      preHandler: hydrateAuthIfPresent,
    },
    async function listAuctionBidsHandler(
      request: FastifyRequest<{
        Params: unknown;
        Querystring: unknown;
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = auctionParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(
          reply,
          parsedParams.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const parsedQuery = auctionBidsQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(
          reply,
          parsedQuery.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const { id } = parsedParams.data;
      const { cursor, limit } = parsedQuery.data;
      await hydrateAuthIfPresent(request);

      const [actorBase, now, auctionAccess] = await Promise.all([
        loadVipRequestActorBase(request),
        readTrustedCurrentTime(prisma),
        prisma.auction.findUnique({
          where: {
            id,
          },
          select: {
            id: true,
            sellerCompanyId: true,
            approvedAt: true,
            vipAccessPolicy: true,
            vipReleaseAt: true,
          },
        }),
      ]);

      if (!auctionAccess) {
        await reply.code(404).send({
          error: "Auction not found",
        });
        return;
      }

      const bidHistoryDecision = evaluateVipAccess({
        actorBase,
        snapshot: {
          approvedAt: auctionAccess.approvedAt,
          vipAccessPolicy: auctionAccess.vipAccessPolicy,
          vipReleaseAt: auctionAccess.vipReleaseAt,
          sellerCompanyId: auctionAccess.sellerCompanyId,
        },
        now,
      });

      if (!bidHistoryDecision.canViewBidHistory) {
        await reply.code(404).send({
          error: "Auction not found",
        });
        return;
      }

      const bids = await prisma.bid.findMany({
        where: {
          auctionId: id,
        },
        take: limit + 1,
        ...(cursor
          ? {
              skip: 1,
              cursor: {
                id: cursor,
              },
            }
          : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const hasNextPage = bids.length > limit;
      const pageItems = hasNextPage ? bids.slice(0, limit) : bids;
      const nextCursor = hasNextPage ? pageItems[pageItems.length - 1]?.id ?? null : null;
      const companyIds = Array.from(new Set(pageItems.map((bid) => bid.companyId)));
      const userIds = Array.from(new Set(pageItems.map((bid) => bid.userId)));
      const [companies, users] = await Promise.all([
        companyIds.length > 0
          ? prisma.company.findMany({
              where: {
                id: {
                  in: companyIds,
                },
              },
              select: {
                id: true,
                name: true,
                country: true,
              },
            })
          : Promise.resolve([]),
        userIds.length > 0
          ? prisma.user.findMany({
              where: {
                id: {
                  in: userIds,
                },
              },
              select: {
                id: true,
                emirate: true,
              },
            })
          : Promise.resolve([]),
      ]);
      const companyById = new Map(companies.map((company) => [company.id, company]));
      const userById = new Map(users.map((user) => [user.id, user]));
      const viewerCompanyId = request.auth?.companyId?.trim() ?? null;

      await reply.code(200).send({
        bids: await Promise.all(
          pageItems.map((bid) =>
            serializeBidHistoryEntry(
              {
                id: bid.id,
                auctionId: bid.auctionId,
                companyId: bid.companyId,
                userId: bid.userId,
                amount: bid.amount,
                sequenceNo: bid.sequenceNo,
                createdAt: bid.createdAt,
              },
              {
                viewerCompanyId,
                companyById,
                userById,
              },
            ),
          ),
        ),
        nextCursor,
      });
    },
  );

  fastify.post(
    "/auctions/:id/buy-now",
    {
      preHandler: requireAuth,
    },
    async function buyNowAuctionHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = auctionParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(
          reply,
          parsedParams.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const buyerAccess = await requireActiveBuyerAccount(request, reply);

      if (!buyerAccess) {
        return;
      }

      if (buyerAccess.kycVerified !== true) {
        await reply.code(403).send({
          error: "KYC_PENDING",
          message: "Your account is under review.",
        });
        return;
      }

      const buyerCompany = await prisma.company.findUnique({
        where: {
          id: buyerAccess.companyId,
        },
        select: {
          buyerTier: true,
        },
      });

      if (buyerCompany?.buyerTier !== "VIP") {
        await reply.code(403).send({
          error: "BUY_NOW_VIP_ONLY",
          message: "Buy Now is available for VIP buyers only.",
        });
        return;
      }

      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<AuctionLockRow[]>`
              SELECT
                id,
                state,
                version,
                current_price,
                starts_at,
                min_increment,
                buy_now_price,
                seller_company_id,
                approved_at,
                vip_access_policy,
                vip_release_at,
                last_bid_sequence,
                ends_at
              FROM auctions
              WHERE id = ${parsedParams.data.id}
              FOR UPDATE
            `;
            const auction = rows[0];

            if (!auction) {
              throw new Error("AUCTION_NOT_FOUND");
            }

            const now = await readTrustedCurrentTime(tx as {
              $queryRaw: <T = unknown>(
                query: TemplateStringsArray,
                ...values: unknown[]
              ) => Promise<T>;
            });
            const accessDecision = evaluateVipAccess({
              actorBase: createBuyerActorBase(buyerAccess),
              snapshot: {
                approvedAt: auction.approved_at,
                vipAccessPolicy: auction.vip_access_policy,
                vipReleaseAt: auction.vip_release_at,
                sellerCompanyId: auction.seller_company_id,
              },
              now,
            });

            if (!accessDecision.canBuyNow) {
              throw new Error("VIP_EARLY_ACCESS_RESTRICTED");
            }

            if (auction.state !== "SCHEDULED") {
              throw new Error("BUY_NOW_UNAVAILABLE");
            }

            const startsAt = await toDateValue(auction.starts_at);

            if (now >= startsAt) {
              throw new Error("BUY_NOW_UNAVAILABLE");
            }

            if (auction.buy_now_price === null) {
              throw new Error("BUY_NOW_UNAVAILABLE");
            }

            const buyNowPrice = await toNumberValue(auction.buy_now_price);
            const depositLockResult = await ensureAuctionDepositLock(tx, {
              auctionId: parsedParams.data.id,
              companyId: buyerAccess.companyId,
              userId: buyerAccess.userId,
            });

            if (depositLockResult.kind === "deposit_required") {
              throw new Error("NO_DEPOSIT");
            }

            const nextSequenceNo = auction.last_bid_sequence + 1;
            const bidRecord = await tx.bid.create({
              data: {
                auctionId: parsedParams.data.id,
                companyId: buyerAccess.companyId,
                userId: buyerAccess.userId,
                amount: buyNowPrice,
                sequenceNo: nextSequenceNo,
              },
            });

            const updatedRows = await tx.$executeRaw`
              UPDATE auctions
              SET state = ${"AWAITING_SELLER_DECISION"}::"AuctionState",
                  current_price = ${buyNowPrice},
                  last_bid_sequence = ${nextSequenceNo},
                  highest_bid_id = ${bidRecord.id},
                  winner_company_id = ${buyerAccess.companyId},
                  decision_deadline_at = ${await addHours(new Date(), SELLER_DECISION_WINDOW_HOURS)},
                  seller_decision = NULL,
                  seller_decided_at = NULL,
                  seller_decided_by = NULL,
                  closed_at = NOW(),
                  version = version + 1,
                  updated_at = NOW()
              WHERE id = ${parsedParams.data.id}
                AND version = ${auction.version}
            `;

            if (updatedRows !== 1) {
              throw new Error("AUCTION_VERSION_CONFLICT");
            }

            await tx.auctionStateTransition.create({
              data: {
                auctionId: parsedParams.data.id,
                fromState: "SCHEDULED",
                toState: "AWAITING_SELLER_DECISION",
                trigger: "BUY_NOW",
                actorId: buyerAccess.userId,
                reason: JSON.stringify({
                  winnerCompanyId: buyerAccess.companyId,
                  buyNowPrice,
                }),
              },
            });

            await releaseAuctionDepositLocks(tx, {
              auctionId: parsedParams.data.id,
              winnerCompanyId: buyerAccess.companyId,
              reason: "BUY_NOW_RELEASE",
            });
            return {
              price: buyNowPrice,
            };
          },
          {
            isolationLevel: "Serializable",
          },
        );

        void publishAuctionRealtimeSnapshot(parsedParams.data.id, fastify.log);
        await reply.code(200).send({
          message: `Purchase confirmed for AED ${result.price.toLocaleString("en-AE")}`,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "AUCTION_NOT_FOUND") {
          await reply.code(404).send({
            error: "Auction not found",
          });
          return;
        }

        if (error instanceof Error && error.message === "BUY_NOW_UNAVAILABLE") {
          await reply.code(409).send({
            error: "Buy Now is unavailable for this lot",
          });
          return;
        }

        if (error instanceof Error && error.message === "VIP_EARLY_ACCESS_RESTRICTED") {
          await reply.code(403).send({
            error: "Lot is unavailable right now",
          });
          return;
        }

        if (error instanceof Error && error.message === "NO_DEPOSIT") {
          await reply.code(403).send({
            error: "Deposit required to bid",
          });
          return;
        }

        fastify.log.error(
          {
            err: error,
            auctionId: parsedParams.data.id,
            companyId: buyerAccess.companyId,
            userId: buyerAccess.userId,
          },
          "Buy Now failed",
        );

        await reply.code(500).send({
          error: "Internal server error",
        });
      }
    },
  );

  fastify.get(
    "/auctions/:id",
    async function getAuctionHandler(
      request: FastifyRequest<{ Params: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = auctionParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(
          reply,
          parsedParams.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      await hydrateAuthIfPresent(request);

      const [actorBase, now, auction] = await Promise.all([
        loadVipRequestActorBase(request),
        readTrustedCurrentTime(prisma),
        prisma.auction.findUnique({
          where: {
            id: parsedParams.data.id,
          },
          include: {
            vehicle: true,
            bids: {
              take: 10,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            },
          },
        }),
      ]);

      if (!auction) {
        await reply.code(404).send({
          error: "Auction not found",
        });
        return;
      }
      const detailDecision = evaluateVipAccess({
        actorBase,
        snapshot: {
          approvedAt: auction.approvedAt,
          vipAccessPolicy: auction.vipAccessPolicy,
          vipReleaseAt: auction.vipReleaseAt,
          sellerCompanyId: auction.sellerCompanyId,
        },
        now,
      });

      if (!isPublicAuctionState(auction.state) || !detailDecision.canViewDetail) {
        await reply.code(404).send({
          error: "Auction not found",
        });
        return;
      }

      const vehicleOverrideById = await readLatestVehicleOverrideMap([auction.vehicle.id]);

      await reply.code(200).send({
        auction: {
          id: auction.id,
          state: auction.state,
          version: auction.version,
          currentPrice: (await toOptionalNumberValue(auction.currentPrice)) ?? 0,
          minIncrement: (await toOptionalNumberValue(auction.minIncrement)) ?? 0,
          startingPrice: (await toOptionalNumberValue(auction.startingPrice)) ?? 0,
          buyNowPrice: await serializeBuyNowPrice(auction.buyNowPrice),
          startsAt: await toIsoString(auction.startsAt),
          endsAt: await toIsoString(auction.endsAt),
          vipReleaseAt: await toIsoString(auction.vipReleaseAt),
          extensionCount: auction.extensionCount,
          highestBidId: auction.highestBidId,
          showVipEarlyAccessBadge: detailDecision.showVipEarlyAccessBadge,
          vehicle: await serializeVehicle(auction.vehicle, vehicleOverrideById.get(auction.vehicle.id) ?? null),
          bids: await Promise.all(
            auction.bids.map(async (bid) =>
              serializeBid({
                id: bid.id,
                auctionId: bid.auctionId,
                companyId: bid.companyId,
                userId: bid.userId,
                amount: bid.amount,
                sequenceNo: bid.sequenceNo,
                createdAt: bid.createdAt,
              }),
            ),
          ),
        },
      });
    },
  );
}
