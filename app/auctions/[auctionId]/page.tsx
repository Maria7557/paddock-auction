import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { DamageMapValue } from "@/components/seller/DamageDiagram";

import { withLocalePath } from "@/src/i18n/routing";
import { api } from "@/src/lib/api-client";
import { isScheduledWithoutBids } from "@/src/lib/auction-display";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";
import { formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";
import { withServerCookies } from "@/src/lib/server-api-options";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

import { BidHistory } from "./components/BidHistory";
import { BidPanel } from "./components/BidPanel";
import { InspectionSection } from "./components/InspectionSection";
import { LotGallery } from "./components/LotGallery";
import { MobileBidBar } from "./components/MobileBidBar";
import { SimilarVehicles } from "./components/SimilarVehicles";
import { VehicleDesc } from "./components/VehicleDesc";
import { VehicleFeatures } from "./components/VehicleFeatures";
import { VehicleInfo } from "./components/VehicleInfo";
import { VehicleSpecs } from "./components/VehicleSpecs";

import styles from "./page.module.css";

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
  condition: string;
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

type SimilarLot = LotDetail["similar"][number];

const NOT_SPECIFIED = "Not specified";
const DEFAULT_DESCRIPTION = "Seller has not provided a description for this vehicle yet.";
const SIMILAR_AUCTION_STATES = new Set(["SCHEDULED", "LIVE", "EXTENDED"]);
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

function isMeaningfulValue(value: string): boolean {
  return !["", "—", NOT_SPECIFIED].includes(value.trim());
}

function formatSpecPill(regionSpec: string, locale: DisplaySettings["locale"]): string {
  if (!isMeaningfulValue(regionSpec)) {
    return regionSpec;
  }

  return locale === "ru" ? `${regionSpec} spec` : `${regionSpec} spec`;
}

function buildSimilarTitle(vehicle: Record<string, unknown>): string {
  return `${String(vehicle.brand ?? vehicle.make ?? "").trim()} ${String(vehicle.model ?? "").trim()} ${String(vehicle.year ?? "").trim()}`
    .replace(/\s+/g, " ")
    .trim();
}

function buildSimilarImage(vehicle: Record<string, unknown>): string {
  if (Array.isArray(vehicle.images)) {
    const firstImage = vehicle.images.find(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );

    if (firstImage) {
      return firstImage;
    }
  }

  return "/vehicle-photo.svg";
}

function mapSimilarAuction(source: Record<string, unknown>): SimilarLot | null {
  const vehicle = (source.vehicle as Record<string, unknown> | undefined) ?? {};
  const id = String(source.id ?? "").trim();

  if (!id) {
    return null;
  }

  return {
    id,
    auctionId: id,
    title: buildSimilarTitle(vehicle) || `Lot ${id.slice(0, 8).toUpperCase()}`,
    year: Number(vehicle.year ?? 0),
    mileageKm: Number(vehicle.mileage ?? vehicle.mileageKm ?? 0),
    currentBidAed: Number(source.currentPrice ?? source.currentBidAed ?? source.startingPrice ?? 0),
    state: String(source.state ?? "SCHEDULED"),
    imageUrl: buildSimilarImage(vehicle),
  };
}

async function getFallbackSimilarLots(currentLot: LotDetail): Promise<SimilarLot[]> {
  try {
    const payload = await api.auctions.list<{
      auctions?: Array<Record<string, unknown>>;
      lots?: Array<Record<string, unknown>>;
    }>(undefined, {
      cache: "no-store",
    });
    const rawAuctions = payload.auctions ?? payload.lots ?? [];

    return rawAuctions
      .map(mapSimilarAuction)
      .filter((item): item is SimilarLot => item !== null)
      .filter((item) => item.id !== currentLot.auctionId && SIMILAR_AUCTION_STATES.has(item.state))
      .map((item) => {
        const sameMake = currentLot.make.trim() && item.title.toLowerCase().includes(currentLot.make.toLowerCase());
        const sameModel = currentLot.model.trim() && item.title.toLowerCase().includes(currentLot.model.toLowerCase());
        const sameState = item.state === currentLot.state;
        const score =
          (sameMake ? 4 : 0) +
          (sameModel ? 3 : 0) +
          (sameState ? 1 : 0) +
          (item.year === currentLot.year ? 1 : 0);

        return {
          ...item,
          score,
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return right.year - left.year;
      })
      .slice(0, 3)
      .map((item) => {
        const { score, ...rest } = item;
        void score;
        return rest;
      });
  } catch {
    return [];
  }
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
    const latestBidAmount =
      bidsSource.length > 0 ? Number(bidsSource[0]?.amountAed ?? bidsSource[0]?.amount ?? 0) : 0;
    const currentBidAed = Math.max(Number(auction.currentPrice ?? auction.currentBidAed ?? 0), latestBidAmount);

    return {
      id: String(auction.id ?? auctionId),
      lotNumber: String(auction.lotNumber ?? `LOT-${auctionId.slice(0, 8).toUpperCase()}`),
      auctionId: String(auction.id ?? auctionId),
      state: (auction.state as LotAuctionState | undefined) ?? "SCHEDULED",
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
      currentBidAed,
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

export async function generateMetadata({ params }: { params: Promise<{ auctionId: string }> }): Promise<Metadata> {
  const { auctionId } = await params;
  const lot = await getLot(auctionId);
  const display = await getPublicDisplaySettings();

  if (!lot) {
    return { title: display.locale === "ru" ? "Лот не найден" : "Lot Not Found" };
  }

  return {
    title: lot.title,
    description:
      isScheduledWithoutBids(lot.state, lot.currentBidAed)
        ? display.locale === "ru"
          ? `${lot.title}, ${formatInteger(lot.mileageKm, display.locale)} км, спецификация ${lot.regionSpec}. Лот открыт для первой pre-bid ставки до старта аукциона.`
          : `${lot.title}, ${formatInteger(lot.mileageKm, display.locale)} km, ${lot.regionSpec} spec. This lot is open for the first pre-bid before the auction starts.`
        : display.locale === "ru"
          ? `${lot.title}, ${formatInteger(lot.mileageKm, display.locale)} км, спецификация ${lot.regionSpec}. Текущая ставка ${formatMoneyFromAed(lot.currentBidAed, display)}.`
          : `${lot.title}, ${formatInteger(lot.mileageKm, display.locale)} km, ${lot.regionSpec} spec. Current bid ${formatMoneyFromAed(lot.currentBidAed, display)}.`,
    openGraph: {
      title: `${lot.title} — Lot #${lot.lotNumber}`,
      images: lot.images[0] ? [lot.images[0]] : [],
    },
  };
}

export default async function AuctionDetailPage({ params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await params;
  const lot = await getLot(auctionId);
  const display = await getPublicDisplaySettings();
  const isRu = display.locale === "ru";

  if (!lot) {
    notFound();
  }

  const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
  const isScheduled = lot.state === "SCHEDULED";
  const isActive = isLive || isScheduled;
  const summaryFacts = [
    lot.year > 0 ? String(lot.year) : null,
    lot.mileageKm > 0 ? `${formatInteger(lot.mileageKm, display.locale)} ${isRu ? "км" : "km"}` : null,
  ].filter((fact): fact is string => fact !== null);
  const specPills = [formatSpecPill(lot.regionSpec, display.locale), lot.fuelType].filter(isMeaningfulValue);
  const hasDamage = lot.damageItems.length > 0 || (isMeaningfulValue(lot.damage) && lot.damage !== "None");
  const damageSummary = lot.damageItems.length > 0 ? (isRu ? "Повреждения отмечены" : "Damage reported") : lot.damage;
  const similarLots = lot.similar.length > 0 ? lot.similar : await getFallbackSimilarLots(lot);

  return (
    <MarketShell mainClassName={styles.mainTight}>
      <div className={styles.page}>
        {isLive ? (
          <Link
            href={`/auctions/live/${lot.auctionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.liveBanner}
          >
            <span className={styles.liveDot} aria-hidden />
            Auction is LIVE — Join the bidding room
            <span className={styles.liveBannerArrow} aria-hidden>
              →
            </span>
          </Link>
        ) : null}

        <nav className={styles.breadcrumb} aria-label="breadcrumb">
          <Link href={withLocalePath("/", display.locale)}>{isRu ? "Главная" : "Home"}</Link>
          <span aria-hidden>›</span>
          <Link href={withLocalePath("/auctions", display.locale)}>{isRu ? "Аукционы" : "Auctions"}</Link>
          <span aria-hidden>›</span>
          <span>{lot.title}</span>
        </nav>

        <div className={styles.titleBar}>
          <div className={styles.titleLeft}>
            <h1 className={styles.h1}>{lot.title}</h1>
            <div className={styles.quickMeta}>
              <div className={styles.quickMetaFacts}>
                {summaryFacts.map((fact, index) => (
                  <span key={`${fact}-${index}`}>
                    {index > 0 ? <span className={styles.dot}>·</span> : null}
                    <span>{fact}</span>
                  </span>
                ))}
                {hasDamage ? (
                  <span>
                    {summaryFacts.length > 0 ? <span className={styles.dot}>·</span> : null}
                    <span className={styles.damage}>{damageSummary}</span>
                  </span>
                ) : null}
              </div>
            </div>
            {specPills.length > 0 ? (
              <div className={styles.specPills}>
                {specPills.map((pill) => (
                  <span key={pill} className={styles.pill}>
                    {pill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.contentGrid}>
          <div className={styles.galleryCol}>
            <LotGallery images={lot.images} title={lot.title} />
          </div>
          <aside className={styles.bidCol}>
            <BidPanel lot={lot} totalBids={lot.totalBids} display={display} />
          </aside>
          <div className={styles.main}>
            <VehicleInfo lot={lot} locale={display.locale} />
            <VehicleSpecs lot={lot} locale={display.locale} />
            <VehicleFeatures features={lot.features} locale={display.locale} />
            <VehicleDesc description={lot.description} highlights={lot.highlights} locale={display.locale} />
            <InspectionSection auctionId={lot.auctionId} startsAt={lot.startsAt} locale={display.locale} />
            <BidHistory bids={lot.bids} display={display} />
          </div>
        </div>

        {similarLots.length > 0 ? <SimilarVehicles lots={similarLots} display={display} /> : null}
      </div>

      {isActive ? (
        <MobileBidBar
          auctionId={lot.auctionId}
          state={lot.state}
          currentBidAed={lot.currentBidAed}
          targetAt={isLive ? lot.endsAt : lot.startsAt}
          display={display}
        />
      ) : null}
    </MarketShell>
  );
}
