import type { LotDetail } from "@/app/auctions/[auctionId]/page";

const NOT_SPECIFIED = "Not specified";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

function buildTitle(year: number, make: string, model: string, fallback: string): string {
  const title = `${make} ${model} ${year > 0 ? String(year) : ""}`.replace(/\s+/g, " ").trim();

  return title || fallback;
}

export type EventLotView = {
  id: string;
  auctionId: string;
  lotNumber: string;
  title: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  condition: string;
  regionSpec: string;
  fuelType: string;
  bodyStyle: string;
  transmission: string;
  driveType: string;
  color: string;
  colorInterior: string;
  engine: string;
  airbags: string;
  damage: string;
  sellerName: string;
  location: string;
  vin: string;
  images: string[];
};

export function mapServerLotToEventLotView(lot: LotDetail): EventLotView {
  return {
    id: lot.id,
    auctionId: lot.auctionId,
    lotNumber: lot.lotNumber,
    title: lot.title,
    make: lot.make,
    model: lot.model,
    year: lot.year,
    mileageKm: lot.mileageKm,
    condition: lot.condition,
    regionSpec: lot.regionSpec,
    fuelType: lot.fuelType,
    bodyStyle: lot.bodyStyle,
    transmission: lot.transmission,
    driveType: lot.driveType,
    color: lot.color,
    colorInterior: lot.colorInterior,
    engine: lot.engine,
    airbags: lot.airbags,
    damage: lot.damage,
    sellerName: lot.sellerName,
    location: lot.location,
    vin: lot.vin,
    images: lot.images,
  };
}

export function mapAuctionPayloadToEventLotView(
  payload: Record<string, unknown>,
  fallbackAuctionId: string,
): EventLotView | null {
  const auction = asRecord(payload.auction) ?? payload;
  const vehicle = asRecord(auction.vehicle) ?? asRecord(payload.vehicle) ?? payload;

  const auctionId = asString(auction.id, fallbackAuctionId);
  const make = asString(vehicle.brand ?? vehicle.make);
  const model = asString(vehicle.model);
  const year = asNumber(vehicle.year);
  const title = buildTitle(year, make, model, asString(auction.lotNumber, `Lot ${auctionId.slice(0, 8).toUpperCase()}`));

  return {
    id: auctionId,
    auctionId,
    lotNumber: asString(auction.lotNumber, `LOT-${auctionId.slice(0, 8).toUpperCase()}`),
    title,
    make,
    model,
    year,
    mileageKm: asNumber(vehicle.mileage ?? vehicle.mileageKm),
    condition: asString(vehicle.condition, NOT_SPECIFIED),
    regionSpec: asString(vehicle.regionSpec, NOT_SPECIFIED),
    fuelType: asString(vehicle.fuelType, NOT_SPECIFIED),
    bodyStyle: asString(vehicle.bodyType ?? vehicle.bodyStyle, NOT_SPECIFIED),
    transmission: asString(vehicle.transmission, NOT_SPECIFIED),
    driveType: asString(vehicle.driveType ?? vehicle.drivetrain, NOT_SPECIFIED),
    color: asString(vehicle.exteriorColor ?? vehicle.color, NOT_SPECIFIED),
    colorInterior: asString(vehicle.interiorColor, NOT_SPECIFIED),
    engine: asString(vehicle.engine, "—"),
    airbags: asString(vehicle.airbags, NOT_SPECIFIED),
    damage: asString(vehicle.damage, NOT_SPECIFIED),
    sellerName: asString(auction.sellerName ?? payload.sellerName, NOT_SPECIFIED),
    location: asString(auction.location ?? vehicle.location, NOT_SPECIFIED),
    vin: asString(vehicle.vin, "—"),
    images: asStringArray(vehicle.images),
  };
}
