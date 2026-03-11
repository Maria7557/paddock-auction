export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";

import { AuctionState, Prisma } from "@prisma/client";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

const createAuctionSchema = z.object({
  vehicleId: z.string().uuid(),
  startingPrice: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const allowedListStates = new Set<AuctionState>(["LIVE", "SCHEDULED"]);
const allowedSorts = new Set(["ending_soon", "newest", "price_asc", "price_desc"]);
const FALLBACK_LOT_IMAGES = [
  "/images/car-elantra.jpg",
  "/images/car-gwagon.jpg",
  "/images/car-bentley.jpg",
  "/images/car-mclaren.jpg",
  "/images/car-mustang.jpg",
];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function createPayloadHash(payload: Prisma.InputJsonValue): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeStringParam(value: string | null): string {
  return value?.trim() ?? "";
}

function parseNonNegativeNumber(value: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function resolveListingStatus(statusRaw: string): AuctionState | null | "invalid" {
  if (!statusRaw) {
    return null;
  }

  const normalized = statusRaw.toUpperCase();

  if (!allowedListStates.has(normalized as AuctionState)) {
    return "invalid";
  }

  return normalized as AuctionState;
}

type SortMode = "ending_soon" | "newest" | "price_asc" | "price_desc";

function resolveSortMode(sortRaw: string): SortMode {
  if (allowedSorts.has(sortRaw)) {
    return sortRaw as SortMode;
  }

  return "ending_soon";
}

function resolveLotState(state: AuctionState): "LIVE" | "SCHEDULED" | "CLOSED" {
  if (state === "LIVE") {
    return "LIVE";
  }

  if (state === "SCHEDULED") {
    return "SCHEDULED";
  }

  return "CLOSED";
}

function getUrgencyTimestamp(auction: {
  state: AuctionState;
  startsAt: Date;
  endsAt: Date;
}): number {
  if (auction.state === "LIVE") {
    return auction.endsAt.getTime();
  }

  if (auction.state === "SCHEDULED") {
    return auction.startsAt.getTime();
  }

  return auction.endsAt.getTime();
}

function resolveSellerReferenceCode(company: {
  registrationNumber: string;
} | null): string {
  if (!company) {
    return "UNKNOWN";
  }

  return company.registrationNumber;
}

function deriveLotImage(brand: string | null | undefined, index: number): string {
  const normalizedBrand = brand?.trim().toLowerCase() ?? "";

  if (normalizedBrand.includes("bentley")) {
    return "/images/car-bentley.jpg";
  }

  if (
    normalizedBrand.includes("mercedes") ||
    normalizedBrand.includes("nissan") ||
    normalizedBrand.includes("gmc")
  ) {
    return "/images/car-gwagon.jpg";
  }

  if (normalizedBrand.includes("mustang") || normalizedBrand.includes("ford")) {
    return "/images/car-mustang.jpg";
  }

  if (
    normalizedBrand.includes("mclaren") ||
    normalizedBrand.includes("ferrari") ||
    normalizedBrand.includes("lamborghini")
  ) {
    return "/images/car-mclaren.jpg";
  }

  return FALLBACK_LOT_IMAGES[index % FALLBACK_LOT_IMAGES.length] ?? "/vehicle-photo.svg";
}

export const POST = withStructuredMutationLogging(async (request: Request): Promise<Response> => {
  const userRole = request.headers.get("x-user-role")?.trim();

  if (userRole !== "SELLER") {
    return json(403, {
      error: "SELLERS_ONLY",
    });
  }

  const actorId = request.headers.get("x-user-id")?.trim();
  const companyId = request.headers.get("x-company-id")?.trim();

  if (!actorId || !companyId) {
    return json(401, {
      error: "UNAUTHORIZED",
    });
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return json(400, {
      error: "INVALID_REQUEST",
      message: "Request body must be valid JSON",
    });
  }

  const parsed = createAuctionSchema.safeParse(requestBody);

  if (!parsed.success) {
    return json(400, {
      error: "INVALID_REQUEST",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const payload = parsed.data;
  const startsAt = new Date(payload.startsAt);
  const endsAt = new Date(payload.endsAt);
  const now = new Date();

  if (!(startsAt.getTime() > now.getTime())) {
    return json(400, {
      error: "INVALID_AUCTION_WINDOW",
      message: "startsAt must be in the future",
    });
  }

  if (!(endsAt.getTime() > startsAt.getTime())) {
    return json(400, {
      error: "INVALID_AUCTION_WINDOW",
      message: "endsAt must be after startsAt",
    });
  }

  const durationMs = endsAt.getTime() - startsAt.getTime();
  const minDurationMs = 60 * 60 * 1000;
  const maxDurationMs = 7 * 24 * 60 * 60 * 1000;

  if (durationMs < minDurationMs || durationMs > maxDurationMs) {
    return json(400, {
      error: "INVALID_AUCTION_WINDOW",
      message: "Auction duration must be between 1 hour and 7 days",
    });
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: {
      id: payload.vehicleId,
    },
    select: {
      id: true,
    },
  });

  if (!vehicle) {
    return json(404, {
      error: "VEHICLE_NOT_FOUND",
    });
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      status: true,
    },
  });

  if (!company) {
    return json(404, {
      error: "COMPANY_NOT_FOUND",
    });
  }

  if (company.status !== "ACTIVE") {
    return json(403, {
      error: "COMPANY_NOT_APPROVED",
      message: "Your company is pending approval. Vehicle saved as draft.",
    });
  }

  const correlationId = request.headers.get("x-correlation-id")?.trim();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  const created = await prisma.$transaction(async (tx) => {
    const auctionId = randomUUID();

    const auction = await tx.auction.create({
      data: {
        id: auctionId,
        vehicleId: payload.vehicleId,
        sellerCompanyId: companyId,
        currentPrice: new Prisma.Decimal(payload.startingPrice),
        startsAt,
        endsAt,
        state: "DRAFT",
        version: 1,
      },
    });

    const auditPayload: Prisma.InputJsonValue = {
      auctionId: auction.id,
      vehicleId: payload.vehicleId,
      sellerCompanyId: companyId,
      startingPrice: payload.startingPrice,
      reservePrice: payload.reservePrice ?? null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };

    await tx.auditLog.create({
      data: {
        actorId,
        action: "AUCTION_CREATED",
        entityType: "Auction",
        entityId: auction.id,
        correlationId,
        idempotencyKey,
        payloadHash: createPayloadHash(auditPayload),
        payload: auditPayload,
      },
    });

    return auction;
  });

  return json(201, {
    auctionId: created.id,
    state: created.state,
    vehicleId: created.vehicleId,
    startsAt: created.startsAt.toISOString(),
    endsAt: created.endsAt.toISOString(),
  });
});

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const statusRaw = normalizeStringParam(searchParams.get("status") ?? searchParams.get("state"));
  const status = resolveListingStatus(statusRaw);

  if (status === "invalid") {
    return json(400, {
      error: "INVALID_STATUS_FILTER",
      message: "Only LIVE and SCHEDULED are supported for status filter",
    });
  }

  const minPrice = parseNonNegativeNumber(normalizeStringParam(searchParams.get("minPrice")));
  const maxPrice = parseNonNegativeNumber(normalizeStringParam(searchParams.get("maxPrice")));
  const region = normalizeStringParam(searchParams.get("region"));
  const bodyType = normalizeStringParam(searchParams.get("bodyType"));
  const fuelType = normalizeStringParam(searchParams.get("fuelType"));
  const brand = normalizeStringParam(searchParams.get("brand"));
  const model = normalizeStringParam(searchParams.get("model"));
  const maxMileage = parseNonNegativeNumber(normalizeStringParam(searchParams.get("maxMileage")));
  const minYear = parseNonNegativeNumber(normalizeStringParam(searchParams.get("minYear")));
  const seller = normalizeStringParam(searchParams.get("seller"));
  const q = normalizeStringParam(searchParams.get("q"));
  const sort = resolveSortMode(normalizeStringParam(searchParams.get("sort")).toLowerCase());

  const where: Prisma.AuctionWhereInput = {
    state: status ? status : { in: ["LIVE", "SCHEDULED"] },
  };

  const currentPriceFilter: Prisma.DecimalFilter = {};

  if (minPrice > 0) {
    currentPriceFilter.gte = minPrice;
  }

  if (maxPrice > 0) {
    currentPriceFilter.lte = maxPrice;
  }

  if (Object.keys(currentPriceFilter).length > 0) {
    where.currentPrice = currentPriceFilter;
  }

  const vehicleWhere: Prisma.VehicleWhereInput = {};

  if (region) {
    vehicleWhere.regionSpec = { equals: region, mode: "insensitive" };
  }

  if (bodyType) {
    vehicleWhere.bodyType = { equals: bodyType, mode: "insensitive" };
  }

  if (fuelType) {
    vehicleWhere.fuelType = { equals: fuelType, mode: "insensitive" };
  }

  if (brand) {
    vehicleWhere.brand = { equals: brand, mode: "insensitive" };
  }

  if (model) {
    vehicleWhere.model = { equals: model, mode: "insensitive" };
  }

  if (maxMileage > 0) {
    vehicleWhere.mileage = { lte: Math.round(maxMileage) };
  }

  if (minYear > 0) {
    vehicleWhere.year = { gte: Math.round(minYear) };
  }

  if (q) {
    vehicleWhere.OR = [
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
    ];
  }

  if (Object.keys(vehicleWhere).length > 0) {
    where.vehicle = vehicleWhere;
  }

  if (seller) {
    where.sellerCompanyId = seller;
  }

  const orderBy: Prisma.AuctionOrderByWithRelationInput[] = (() => {
    switch (sort) {
      case "price_asc":
        return [{ currentPrice: "asc" }, { id: "asc" }];
      case "price_desc":
        return [{ currentPrice: "desc" }, { id: "asc" }];
      case "newest":
        return [{ createdAt: "desc" }, { id: "asc" }];
      case "ending_soon":
      default:
        return [{ createdAt: "desc" }, { id: "asc" }];
    }
  })();

  const auctions = await prisma.auction.findMany({
    where,
    orderBy,
    include: {
      vehicle: true,
      _count: {
        select: {
          bids: true,
        },
      },
    },
  });

  const sellerIds = [...new Set(auctions.map((auction) => auction.sellerCompanyId))];

  const companies = sellerIds.length
    ? await prisma.company.findMany({
        where: {
          id: {
            in: sellerIds,
          },
        },
        select: {
          id: true,
          name: true,
          registrationNumber: true,
        },
      })
    : [];

  const companyById = new Map(companies.map((company) => [company.id, company]));

  const sortedAuctions =
    sort === "ending_soon"
      ? [...auctions].sort((left, right) => {
          const leftStateRank = left.state === "LIVE" ? 0 : left.state === "SCHEDULED" ? 1 : 2;
          const rightStateRank = right.state === "LIVE" ? 0 : right.state === "SCHEDULED" ? 1 : 2;

          if (leftStateRank !== rightStateRank) {
            return leftStateRank - rightStateRank;
          }

          const urgencyDelta = getUrgencyTimestamp(left) - getUrgencyTimestamp(right);

          if (urgencyDelta !== 0) {
            return urgencyDelta;
          }

          return left.id.localeCompare(right.id);
        })
      : auctions;

  const lots = sortedAuctions.map((auction, index) => {
    const sellerCompany = companyById.get(auction.sellerCompanyId) ?? null;
    const currentBidAed = decimalToNumber(auction.currentPrice);
    const marketPriceAed =
      auction.vehicle.marketPrice !== null && auction.vehicle.marketPrice !== undefined
        ? decimalToNumber(auction.vehicle.marketPrice)
        : Math.round(currentBidAed * 1.25);

    return {
      id: auction.id,
      state: resolveLotState(auction.state),
      title: `${auction.vehicle.brand} ${auction.vehicle.model}`.trim(),
      currentBidAed,
      marketPriceAed,
      endsAt: auction.endsAt.toISOString(),
      startsAt: auction.startsAt.toISOString(),
      totalBids: auction._count.bids,
      year: auction.vehicle.year,
      mileageKm: auction.vehicle.mileage,
      imageUrl: deriveLotImage(auction.vehicle.brand, index),
      vehicle: {
        brand: auction.vehicle.brand,
        model: auction.vehicle.model,
        year: auction.vehicle.year,
        mileage: auction.vehicle.mileage,
        bodyType: auction.vehicle.bodyType ?? undefined,
        fuelType: auction.vehicle.fuelType ?? undefined,
        regionSpec: auction.vehicle.regionSpec ?? undefined,
        images: [],
      },
      seller: {
        name: sellerCompany?.name ?? "Verified Seller",
        referenceCode: resolveSellerReferenceCode(sellerCompany),
      },
    };
  });

  return json(200, {
    lots,
    total: lots.length,
  });
}
