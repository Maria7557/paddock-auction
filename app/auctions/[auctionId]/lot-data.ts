import type { DamageMapValue } from "@/components/seller/DamageDiagram";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import type { LotConditionGrade, LotDetail, LotStartCode, LotWarrantyStatus } from "./types";

const NOT_SPECIFIED = "Not specified";
const DEFAULT_DESCRIPTION = "Seller has not provided a description for this vehicle yet.";
const CURRENT_YEAR = new Date().getUTCFullYear();
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

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asString(value: unknown, fallback = NOT_SPECIFIED): string {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasMeaningfulValue(value: unknown): boolean {
  const normalized = normalizeText(value);
  return normalized.length > 0 && normalized !== "—" && normalized !== NOT_SPECIFIED;
}

function normalizeConditionGrade(value: unknown): string {
  const normalized = normalizeText(value).toUpperCase();

  if (/^[ABCD](?:\+{1,2})?$/.test(normalized)) {
    return normalized;
  }

  return "";
}

function buildVehicleTitle(input: {
  year: number;
  brand: string;
  model: string;
  engine: unknown;
  series: unknown;
}): string {
  return [
    input.year > 0 ? String(input.year) : "",
    normalizeText(input.brand),
    normalizeText(input.model),
    hasMeaningfulValue(input.engine) ? normalizeText(input.engine) : "",
    hasMeaningfulValue(input.series) ? normalizeText(input.series) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getDefaultLotNumber(auctionId: string): string {
  return auctionId.slice(0, 8).toUpperCase();
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

function getConditionGrade(value: unknown): LotConditionGrade {
  const explicit = normalizeConditionGrade(value);

  if (explicit) {
    return explicit;
  }

  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "D";
  }

  if (normalized.includes("excellent") || normalized.includes("mint") || normalized.includes("new")) {
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

function getPrimaryDamage(value: unknown): string {
  const normalized = normalizeText(value);
  return normalized && normalized.toLowerCase() !== "none" ? normalized : "None";
}

function getStartCode(input: {
  explicit: unknown;
  damage: unknown;
  condition: unknown;
}): LotStartCode {
  const explicit = normalizeText(input.explicit).toLowerCase();

  if (explicit === "run & drive" || explicit === "run and drive") {
    return "Run & Drive";
  }

  if (explicit === "stationary" || explicit === "does not start") {
    return "Stationary";
  }

  const damage = normalizeText(input.damage).toLowerCase();
  const condition = normalizeText(input.condition).toLowerCase();
  const stationaryKeywords = ["stationary", "flood", "frame", "rollover", "burn", "non-runner"];

  if (stationaryKeywords.some((keyword) => damage.includes(keyword) || condition.includes(keyword))) {
    return "Stationary";
  }

  return "Run & Drive";
}

function getTitleStatus(input: {
  explicit: unknown;
  damage: unknown;
}): string {
  const explicit = normalizeText(input.explicit);

  if (explicit) {
    return explicit;
  }

  const damage = normalizeText(input.damage).toLowerCase();

  if (!damage || damage === "none") {
    return "Clean";
  }

  if (damage.includes("major") || damage.includes("frame") || damage.includes("rollover")) {
    return "Salvage";
  }

  return "Clean";
}

function getTireCondition(input: {
  explicit: unknown;
  mileageKm: number;
  year: number;
}): number | null {
  const explicit = asNumber(input.explicit, Number.NaN);

  if (Number.isFinite(explicit)) {
    return Math.max(0, Math.min(100, Math.round(explicit)));
  }

  if (input.year <= 0) {
    return null;
  }

  const agePenalty = Math.max(0, (CURRENT_YEAR - input.year) * 5);
  const mileagePenalty = Math.floor(input.mileageKm / 6_000);

  return Math.max(38, Math.min(96, 94 - agePenalty - mileagePenalty));
}

function getNumberOfKeys(input: {
  explicit: unknown;
  condition: unknown;
  startCode: LotStartCode;
}): number {
  const explicit = asNumber(input.explicit, Number.NaN);

  if (Number.isFinite(explicit)) {
    return Math.max(0, Math.round(explicit));
  }

  const grade = getConditionGrade(input.condition);

  if (input.startCode === "Stationary") {
    return 1;
  }

  if (grade.startsWith("A")) {
    return 2;
  }

  if (grade.startsWith("B")) {
    return 1;
  }

  return 0;
}

function getWarrantyStatus(input: {
  explicit: unknown;
  year: number;
  serviceHistory: unknown;
  description: unknown;
}): LotWarrantyStatus {
  const explicit = normalizeText(input.explicit).toUpperCase();

  if (explicit === "ACTIVE" || explicit === "EXPIRED" || explicit === "NONE") {
    return explicit;
  }

  const searchText = `${normalizeText(input.serviceHistory)} ${normalizeText(input.description)}`.toLowerCase();
  const yearMatch = searchText.match(/20\d{2}/);
  const explicitYear = yearMatch ? Number(yearMatch[0]) : null;

  if (searchText.includes("warranty")) {
    if (explicitYear && explicitYear >= CURRENT_YEAR) {
      return "ACTIVE";
    }

    return input.year >= CURRENT_YEAR - 2 ? "ACTIVE" : "EXPIRED";
  }

  if (input.year >= CURRENT_YEAR - 2) {
    return "ACTIVE";
  }

  if (input.year >= CURRENT_YEAR - 5) {
    return "EXPIRED";
  }

  return "NONE";
}

function getManufacturedIn(input: {
  explicit: unknown;
  brand: string;
}): string {
  const explicit = normalizeText(input.explicit);
  return explicit || BRAND_ORIGIN_MAP[input.brand] || "International";
}

function getAirbagCount(input: {
  airbags: string;
  bodyStyle: string;
}): number | null {
  if (!hasMeaningfulValue(input.airbags)) {
    return null;
  }

  const normalizedBodyStyle = normalizeText(input.bodyStyle).toLowerCase();

  if (normalizedBodyStyle === "suv" || normalizedBodyStyle === "van") {
    return 8;
  }

  if (normalizedBodyStyle === "pickup") {
    return 6;
  }

  return 6;
}

function getCylinders(engine: string): string {
  const normalized = normalizeText(engine);

  if (!normalized || normalized === "—") {
    return "Not specified";
  }

  const vMatch = normalized.match(/v\s*([0-9]+)/i);

  if (vMatch) {
    return `${vMatch[1]} cylinders`;
  }

  const inlineMatch = normalized.match(/(?:i|flat)[-\s]?([0-9]+)/i);

  if (inlineMatch) {
    return `${inlineMatch[1]} cylinders`;
  }

  return "Not specified";
}

function getVehicleClass(bodyStyle: string, brand: string): string {
  const normalized = normalizeText(bodyStyle).toLowerCase();

  if (normalized === "suv") {
    return LUXURY_BRANDS.has(brand) ? "Luxury SUV" : "Utility SUV";
  }

  if (normalized === "sedan") {
    return LUXURY_BRANDS.has(brand) ? "Executive sedan" : "Passenger sedan";
  }

  if (normalized === "pickup") {
    return "Commercial pickup";
  }

  if (normalized === "coupe") {
    return "Performance coupe";
  }

  if (normalized === "van") {
    return "People mover";
  }

  return normalizeText(bodyStyle) || "Passenger vehicle";
}

function getLossType(primaryDamage: string): string {
  return primaryDamage === "None" ? "Normal wear" : "Collision";
}

function getInteriorMaterial(input: {
  explicit: unknown;
  brand: string;
  conditionGrade: LotConditionGrade;
  interiorColor: string;
}): string {
  const explicit = normalizeText(input.explicit);

  if (explicit) {
    return explicit;
  }

  if (LUXURY_BRANDS.has(input.brand) || input.conditionGrade.toUpperCase().startsWith("A")) {
    return "Leather";
  }

  if (hasMeaningfulValue(input.interiorColor) && input.conditionGrade.toUpperCase().startsWith("B")) {
    return "Leatherette";
  }

  return "Fabric";
}

function humanizeFeatureKey(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFeatures(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([feature]) => humanizeFeatureKey(feature));
  }

  return [];
}

function buildSeries(input: { explicit: unknown; model: string }): string {
  const explicit = normalizeText(input.explicit);

  if (explicit) {
    return explicit;
  }

  const model = normalizeText(input.model);
  const parts = model.split(" ");

  if (parts.length <= 1) {
    return "";
  }

  return parts.slice(1).join(" ");
}

export async function getLot(auctionId: string): Promise<LotDetail | null> {
  try {
    const data = await api.auctions.get<Record<string, unknown>>(auctionId, await withServerCookies({
      cache: "no-store",
    }));
    const auction = data.auction ? (data.auction as Record<string, unknown>) : data;
    const vehicle =
      (auction.vehicle as Record<string, unknown> | undefined) ??
      (data.vehicle as Record<string, unknown> | undefined) ??
      data;
    const bidsSource = Array.isArray(auction.bids)
      ? (auction.bids as Array<Record<string, unknown>>)
      : Array.isArray(data.bids)
        ? (data.bids as Array<Record<string, unknown>>)
        : [];
    const damageMap =
      vehicle.damageMap && typeof vehicle.damageMap === "object" && !Array.isArray(vehicle.damageMap)
        ? (vehicle.damageMap as DamageMapValue)
        : {};
    const damageItems = getDamageItems(damageMap);
    const bodyStyle = asString(vehicle.bodyType ?? vehicle.bodyStyle ?? vehicle.vehicleClass ?? "");
    const condition = asString(vehicle.condition);
    const conditionGrade = getConditionGrade(vehicle.conditionGrade ?? condition);
    const primaryDamage = getPrimaryDamage(vehicle.primaryDamage ?? vehicle.damage);
    const startCode = getStartCode({
      explicit: vehicle.startCode,
      damage: vehicle.damage,
      condition,
    });
    const warrantyStatus = getWarrantyStatus({
      explicit: vehicle.warrantyStatus,
      year: asNumber(vehicle.year),
      serviceHistory: vehicle.serviceHistory,
      description: vehicle.description,
    });
    const series = buildSeries({
      explicit: vehicle.series ?? vehicle.trim,
      model: asString(vehicle.model ?? "", ""),
    });
    const mileageKm = asNumber(vehicle.mileage ?? vehicle.mileageKm);
    const brand = asString(vehicle.brand ?? vehicle.make ?? "", "");
    const model = asString(vehicle.model ?? "", "");
    const engine = asString(vehicle.engine, "—");
    const colorInterior = asString(vehicle.interiorColor, "");
    const title = buildVehicleTitle({
      year: asNumber(vehicle.year),
      brand,
      model,
      engine: vehicle.engine,
      series,
    });

    return {
      id: String(auction.id ?? auctionId),
      lotNumber: normalizeText(auction.lotNumber) || getDefaultLotNumber(auctionId),
      auctionId: String(auction.id ?? auctionId),
      state: (auction.state as LotDetail["state"] | undefined) ?? "SCHEDULED",
      showVipEarlyAccessBadge: auction.showVipEarlyAccessBadge === true,
      vipReleaseAt: typeof auction.vipReleaseAt === "string" ? auction.vipReleaseAt : null,
      title: title || `Lot ${getDefaultLotNumber(auctionId)}`,
      make: brand,
      model,
      series,
      year: asNumber(vehicle.year),
      vin: asString(vehicle.vin, "—"),
      mileageKm,
      color: asString(vehicle.exteriorColor ?? vehicle.color),
      colorInterior: colorInterior || NOT_SPECIFIED,
      interiorMaterial: getInteriorMaterial({
        explicit: vehicle.interiorMaterial,
        brand,
        conditionGrade,
        interiorColor: colorInterior,
      }),
      condition,
      conditionGrade,
      regionSpec: asString(vehicle.regionSpec),
      airbags: asString(vehicle.airbags),
      airbagCount: getAirbagCount({
        airbags: asString(vehicle.airbags, ""),
        bodyStyle,
      }),
      damage: asString(vehicle.damage, "None"),
      primaryDamage,
      titleStatus: getTitleStatus({
        explicit: vehicle.titleStatus,
        damage: vehicle.damage,
      }),
      startCode,
      numberOfKeys: getNumberOfKeys({
        explicit: vehicle.numberOfKeys,
        condition,
        startCode,
      }),
      tireCondition: getTireCondition({
        explicit: vehicle.tireCondition,
        mileageKm,
        year: asNumber(vehicle.year),
      }),
      warrantyStatus,
      serviceHistory: asString(vehicle.serviceHistory, ""),
      manufacturedIn: getManufacturedIn({
        explicit: vehicle.manufacturedIn,
        brand,
      }),
      estimatedValue: asNumber(vehicle.estimatedValue ?? auction.actualCashValue ?? vehicle.marketPrice, 0) || null,
      damageMap,
      damageItems,
      bodyStyle,
      engine,
      transmission: asString(vehicle.transmission),
      driveType: asString(vehicle.driveType ?? vehicle.drivetrain),
      fuelType: asString(vehicle.fuelType),
      cylinders: getCylinders(asString(vehicle.engine, "")),
      vehicleClass: getVehicleClass(bodyStyle, brand),
      lossType: getLossType(primaryDamage),
      features: getFeatures(vehicle.features),
      description: String(vehicle.description ?? DEFAULT_DESCRIPTION),
      highlights: Array.isArray(vehicle.highlights) ? (vehicle.highlights as string[]) : [],
      sellerName: String(auction.sellerName ?? data.sellerName ?? NOT_SPECIFIED),
      sellerRef: String(auction.sellerRef ?? ""),
      location: String(auction.location ?? vehicle.location ?? NOT_SPECIFIED),
      auctionAt: String(auction.startsAt ?? auction.endsAt ?? new Date().toISOString()),
      actualCashValue: asNumber(auction.actualCashValue ?? vehicle.marketPrice ?? vehicle.estimatedValue),
      currentBidAed: asNumber(auction.currentPrice ?? auction.currentBidAed),
      buyNowAed: asNumber(auction.buyNowPrice ?? auction.buyNowAed),
      minStepAed: asNumber(auction.minIncrement ?? auction.minStepAed, 500),
      totalBids: asNumber(auction.totalBids ?? bidsSource.length),
      endsAt: String(auction.endsAt ?? new Date(Date.now() + 3_600_000).toISOString()),
      startsAt: String(auction.startsAt ?? new Date().toISOString()),
      images:
        Array.isArray(vehicle.images) && vehicle.images.length > 0
          ? (vehicle.images as string[])
          : ["/vehicle-photo.svg"],
      bids: bidsSource.map((bid) => ({
        id: String(bid.id ?? ""),
        maskedBidder: `Bidder ${String(bid.userId ?? bid.companyId ?? "").slice(-4).toUpperCase()}`,
        amountAed: asNumber(bid.amount),
        placedAt: String(bid.createdAt ?? new Date().toISOString()),
      })),
      similar: Array.isArray(data.similar)
        ? (data.similar as Array<Record<string, unknown>>).map((item) => {
            const similarVehicle = (item.vehicle ?? {}) as Record<string, unknown>;

            return {
              id: String(item.id ?? ""),
              auctionId: String(item.id ?? ""),
              title: `${asNumber(similarVehicle.year)} ${String(similarVehicle.brand ?? "")} ${String(similarVehicle.model ?? "")}`.trim(),
              year: asNumber(similarVehicle.year),
              mileageKm: asNumber(similarVehicle.mileage),
              currentBidAed: asNumber(item.currentPrice ?? item.currentBidAed),
              state: String(item.state ?? "SCHEDULED"),
              showVipEarlyAccessBadge: item.showVipEarlyAccessBadge === true,
              imageUrl:
                Array.isArray(similarVehicle.images) &&
                typeof similarVehicle.images[0] === "string" &&
                similarVehicle.images[0].trim().length > 0
                  ? similarVehicle.images[0]
                  : "/vehicle-photo.svg",
            };
          })
        : [],
    };
  } catch {
    return null;
  }
}
