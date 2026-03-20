import type { DamageMapValue } from "@/components/seller/DamageDiagram";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import type { LotDetail } from "./page";

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
    const damageItems = getDamageItems(vehicle.damageMap);

    return {
      id: String(auction.id ?? auctionId),
      lotNumber: String(auction.lotNumber ?? `LOT-${auctionId.slice(0, 8).toUpperCase()}`),
      auctionId: String(auction.id ?? auctionId),
      state: (auction.state as LotDetail["state"] | undefined) ?? "SCHEDULED",
      showVipEarlyAccessBadge: auction.showVipEarlyAccessBadge === true,
      vipReleaseAt: typeof auction.vipReleaseAt === "string" ? auction.vipReleaseAt : null,
      title:
        `${String(vehicle.brand ?? vehicle.make ?? "")} ${String(vehicle.model ?? "")} ${String(vehicle.year ?? "")}`.trim() ||
        String(auction.lotNumber ?? `Lot ${auctionId.slice(0, 8).toUpperCase()}`),
      make: String(vehicle.brand ?? vehicle.make ?? ""),
      model: String(vehicle.model ?? ""),
      series: String(vehicle.series ?? vehicle.trim ?? ""),
      year: Number(vehicle.year ?? 0),
      vin: String(vehicle.vin ?? "—"),
      mileageKm: Number(vehicle.mileage ?? vehicle.mileageKm ?? 0),
      color: String(vehicle.exteriorColor ?? vehicle.color ?? NOT_SPECIFIED),
      colorInterior: String(vehicle.interiorColor ?? NOT_SPECIFIED),
      condition: String(vehicle.condition ?? NOT_SPECIFIED),
      regionSpec: String(vehicle.regionSpec ?? NOT_SPECIFIED),
      airbags: String(vehicle.airbags ?? NOT_SPECIFIED),
      damage: String(vehicle.damage ?? NOT_SPECIFIED),
      damageMap:
        vehicle.damageMap && typeof vehicle.damageMap === "object" && !Array.isArray(vehicle.damageMap)
          ? (vehicle.damageMap as DamageMapValue)
          : {},
      damageItems,
      bodyStyle: String(vehicle.bodyType ?? vehicle.bodyStyle ?? NOT_SPECIFIED),
      engine: String(vehicle.engine ?? "—"),
      transmission: String(vehicle.transmission ?? NOT_SPECIFIED),
      driveType: String(vehicle.driveType ?? vehicle.drivetrain ?? NOT_SPECIFIED),
      fuelType: String(vehicle.fuelType ?? NOT_SPECIFIED),
      features: Array.isArray(vehicle.features) ? (vehicle.features as string[]) : [],
      description: String(vehicle.description ?? DEFAULT_DESCRIPTION),
      highlights: Array.isArray(vehicle.highlights) ? (vehicle.highlights as string[]) : [],
      sellerName: String(auction.sellerName ?? data.sellerName ?? NOT_SPECIFIED),
      sellerRef: String(auction.sellerRef ?? ""),
      location: String(auction.location ?? vehicle.location ?? NOT_SPECIFIED),
      auctionAt: String(auction.startsAt ?? auction.endsAt ?? new Date().toISOString()),
      actualCashValue: Number(auction.actualCashValue ?? vehicle.marketPrice ?? 0),
      currentBidAed: Number(auction.currentPrice ?? auction.currentBidAed ?? 0),
      buyNowAed: Number(auction.buyNowPrice ?? auction.buyNowAed ?? 0),
      minStepAed: Number(auction.minIncrement ?? auction.minStepAed ?? 500),
      totalBids: Number(auction.totalBids ?? bidsSource.length),
      endsAt: String(auction.endsAt ?? new Date(Date.now() + 3600_000).toISOString()),
      startsAt: String(auction.startsAt ?? new Date().toISOString()),
      images:
        Array.isArray(vehicle.images) && vehicle.images.length > 0
          ? (vehicle.images as string[])
          : ["/vehicle-photo.svg"],
      bids: bidsSource.map((bid) => ({
        id: String(bid.id ?? ""),
        maskedBidder: `Bidder ${String(bid.userId ?? "").slice(-4).toUpperCase()}`,
        amountAed: Number(bid.amount ?? 0),
        placedAt: String(bid.createdAt ?? new Date().toISOString()),
      })),
      similar: Array.isArray(data.similar)
        ? (data.similar as Array<Record<string, unknown>>).map((item) => {
            const similarVehicle = (item.vehicle ?? {}) as Record<string, unknown>;

            return {
              id: String(item.id ?? ""),
              auctionId: String(item.id ?? ""),
              title: `${Number(similarVehicle.year ?? 0)} ${String(similarVehicle.brand ?? "")} ${String(similarVehicle.model ?? "")}`.trim(),
              year: Number(similarVehicle.year ?? 0),
              mileageKm: Number(similarVehicle.mileage ?? 0),
              currentBidAed: Number(item.currentPrice ?? item.currentBidAed ?? 0),
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
