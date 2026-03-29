import type { DamageMapValue } from "@/components/seller/DamageDiagram";

import { api } from "@/src/lib/api-client";

type LotAuctionState =
  | "DRAFT"
  | "SCHEDULED"
  | "LIVE"
  | "EXTENDED"
  | "PAYMENT_PENDING"
  | "ENDED"
  | "DEFAULTED"
  | "CLOSED"
  | "PAID"
  | "CANCELED"
  | "RELISTED";

export type LotDetail = {
  id: string;
  lotNumber: string;
  auctionId: string;
  state: LotAuctionState;
  title: string;
  make: string;
  model: string;
  series: string;
  year: number;
  vin: string;
  mileageKm: number;
  color: string;
  colorInterior: string;
  regionSpec: string;
  airbags: string;
  damage: string;
  damageMap: DamageMapValue;
  damageItems: Array<{
    label: string;
    level: "MINOR" | "MAJOR";
  }>;
  bodyStyle: string;
  engine: string;
  transmission: string;
  driveType: string;
  fuelType: string;
  features: string[];
  description: string;
  highlights: string[];
  sellerName: string;
  sellerRef: string;
  location: string;
  auctionAt: string;
  actualCashValue: number;
  currentBidAed: number;
  buyNowAed: number;
  minStepAed: number;
  totalBids: number;
  endsAt: string;
  startsAt: string;
  images: string[];
  bids: Array<{
    id: string;
    maskedBidder: string;
    amountAed: number;
    placedAt: string;
  }>;
  similar: Array<{
    id: string;
    auctionId: string;
    title: string;
    year: number;
    mileageKm: number;
    currentBidAed: number;
    state: string;
    imageUrl: string;
  }>;
};

const NOT_SPECIFIED = "Not specified";
const DEFAULT_DESCRIPTION = "Seller has not provided a description for this vehicle yet.";
const DAMAGE_ZONE_LABELS: Record<string, string> = {
  front_bumper: "Front Bumper",
  hood: "Hood",
  fender_fl: "Front Left Fender",
  fender_fr: "Front Right Fender",
  door_fl: "Front Left Door",
  door_fr: "Front Right Door",
  roof: "Roof",
  door_rl: "Rear Left Door",
  door_rr: "Rear Right Door",
  trunk_area: "Trunk Area",
  quarter_rl: "Rear Left Quarter Panel",
  quarter_rr: "Rear Right Quarter Panel",
  trunk: "Trunk Lid",
  rear_bumper: "Rear Bumper",
  underbody: "Underbody",
};
const DAMAGE_ZONE_ORDER = Object.keys(DAMAGE_ZONE_LABELS);

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isDamageLevel(value: unknown): value is "MINOR" | "MAJOR" {
  return value === "MINOR" || value === "MAJOR";
}

function getDamageItems(value: unknown): LotDetail["damageItems"] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const damageMap = value as Record<string, unknown>;
  const entries = Object.entries(damageMap).reduce<Array<[string, "MINOR" | "MAJOR"]>>((acc, [zoneId, level]) => {
    if (isDamageLevel(level)) {
      acc.push([zoneId, level]);
    }

    return acc;
  }, []);

  return entries
    .sort(([left], [right]) => {
      const leftIndex = DAMAGE_ZONE_ORDER.indexOf(left);
      const rightIndex = DAMAGE_ZONE_ORDER.indexOf(right);

      if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right);
      }

      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      return leftIndex - rightIndex;
    })
    .map(([zoneId, level]) => ({
      label: DAMAGE_ZONE_LABELS[zoneId] ?? zoneId,
      level,
    }));
}

function buildTitle(vehicle: Record<string, unknown>, auction: Record<string, unknown>, auctionId: string): string {
  const year = asString(vehicle.year);
  const make = asString(vehicle.brand ?? vehicle.make);
  const model = asString(vehicle.model);
  const title = `${make} ${model} ${year}`.replace(/\s+/g, " ").trim();

  return title || asString(auction.lotNumber, `Lot ${auctionId.slice(0, 8).toUpperCase()}`);
}

export async function getLot(auctionId: string): Promise<LotDetail | null> {
  try {
    const payload = await api.auctions.get<Record<string, unknown>>(auctionId, {
      cache: "no-store",
    });
    const auction = asRecord(payload.auction ?? payload);
    const vehicle = asRecord(auction.vehicle ?? payload.vehicle);
    const bidsSource = Array.isArray(payload.bids)
      ? (payload.bids as Array<Record<string, unknown>>)
      : Array.isArray(auction.bids)
        ? (auction.bids as Array<Record<string, unknown>>)
        : [];
    const damageMap = (vehicle.damageMap ?? null) as DamageMapValue;
    const damageItems = getDamageItems(damageMap);
    const latestBidAmount = bidsSource.length > 0 ? asNumber(bidsSource[0]?.amountAed ?? bidsSource[0]?.amount) : 0;
    const currentBidAed = Math.max(asNumber(auction.currentPrice ?? auction.currentBidAed), latestBidAmount);

    return {
      id: asString(auction.id, auctionId),
      lotNumber: asString(auction.lotNumber, `LOT-${auctionId.slice(0, 8).toUpperCase()}`),
      auctionId: asString(auction.id, auctionId),
      state: asString(auction.state, "SCHEDULED") as LotAuctionState,
      title: buildTitle(vehicle, auction, auctionId),
      make: asString(vehicle.brand ?? vehicle.make),
      model: asString(vehicle.model),
      series: asString(vehicle.series),
      year: asNumber(vehicle.year),
      vin: asString(vehicle.vin),
      mileageKm: asNumber(vehicle.mileage ?? vehicle.mileageKm),
      color: asString(vehicle.exteriorColor ?? vehicle.color, NOT_SPECIFIED),
      colorInterior: asString(vehicle.interiorColor, NOT_SPECIFIED),
      regionSpec: asString(vehicle.regionSpec, NOT_SPECIFIED),
      airbags: asString(vehicle.airbags, NOT_SPECIFIED),
      damage: asString(vehicle.damage, damageItems[0]?.label ?? NOT_SPECIFIED),
      damageMap,
      damageItems,
      bodyStyle: asString(vehicle.bodyType ?? vehicle.bodyStyle, NOT_SPECIFIED),
      engine: asString(vehicle.engine, "—"),
      transmission: asString(vehicle.transmission, NOT_SPECIFIED),
      driveType: asString(vehicle.driveType ?? vehicle.drivetrain, NOT_SPECIFIED),
      fuelType: asString(vehicle.fuelType, NOT_SPECIFIED),
      features: asStringArray(vehicle.features),
      description: asString(vehicle.description, DEFAULT_DESCRIPTION),
      highlights: asStringArray(vehicle.highlights),
      sellerName: asString(auction.sellerName ?? payload.sellerName, NOT_SPECIFIED),
      sellerRef: asString(auction.sellerRef, "—"),
      location: asString(auction.location ?? vehicle.location, NOT_SPECIFIED),
      auctionAt: asString(auction.startsAt ?? auction.auctionAt ?? new Date().toISOString()),
      actualCashValue: asNumber(auction.actualCashValue, 0),
      currentBidAed,
      buyNowAed: asNumber(auction.buyNowPrice ?? auction.buyNowAed),
      minStepAed: asNumber(auction.minIncrement ?? auction.minStepAed, 500),
      totalBids: asNumber(auction.totalBids ?? bidsSource.length),
      endsAt: asString(auction.endsAt, new Date(Date.now() + 60 * 60 * 1000).toISOString()),
      startsAt: asString(auction.startsAt, new Date().toISOString()),
      images: asStringArray(vehicle.images).length > 0 ? asStringArray(vehicle.images) : ["/vehicle-photo.svg"],
      bids: bidsSource.map((bid) => ({
        id: asString(bid.id),
        maskedBidder: asString(bid.maskedBidder, "Bidder"),
        amountAed: asNumber(bid.amountAed ?? bid.amount),
        placedAt: asString(bid.placedAt ?? bid.createdAt, new Date().toISOString()),
      })),
      similar: [],
    };
  } catch {
    return null;
  }
}
