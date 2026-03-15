import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withLocalePath } from "@/src/i18n/routing";
import { api } from "@/src/lib/api-client";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";
import { formatInteger, formatMoneyFromAed } from "@/src/lib/money";
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

function isMeaningfulValue(value: string): boolean {
  return !["", "—", NOT_SPECIFIED].includes(value.trim());
}

async function getLot(auctionId: string): Promise<LotDetail | null> {
  try {
    const data = await api.auctions.get<Record<string, unknown>>(auctionId, {
      cache: "no-store",
    });
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
      display.locale === "ru"
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
    lot.year > 0 ? formatInteger(lot.year, display.locale) : null,
    lot.mileageKm > 0 ? `${formatInteger(lot.mileageKm, display.locale)} ${isRu ? "км" : "km"}` : null,
    isMeaningfulValue(lot.condition) ? lot.condition : null,
    isMeaningfulValue(lot.regionSpec) ? lot.regionSpec : null,
    isMeaningfulValue(lot.airbags) ? `${lot.airbags} ${isRu ? "подушек" : "airbags"}` : null,
  ].filter((fact): fact is string => fact !== null);
  const specPills = [lot.regionSpec, lot.transmission, lot.bodyStyle].filter(isMeaningfulValue);
  const hasDamage = isMeaningfulValue(lot.damage) && lot.damage !== "None";

  return (
    <MarketShell mainClassName={styles.mainTight}>
      <div className={styles.page}>
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
                    <span className={styles.damage}>{lot.damage}</span>
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

        <div className={styles.hero}>
          <div className={styles.galleryCol}>
            <LotGallery images={lot.images} title={lot.title} />
          </div>
          <aside className={styles.bidCol}>
            <BidPanel lot={lot} totalBids={lot.totalBids} display={display} />
          </aside>
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <VehicleInfo lot={lot} locale={display.locale} />
            <VehicleSpecs lot={lot} locale={display.locale} />
            <VehicleFeatures features={lot.features} locale={display.locale} />
            <VehicleDesc description={lot.description} highlights={lot.highlights} locale={display.locale} />
            <InspectionSection auctionId={lot.auctionId} startsAt={lot.startsAt} locale={display.locale} />
            <BidHistory bids={lot.bids} display={display} />
          </div>
        </div>

        {lot.similar.length > 0 ? <SimilarVehicles lots={lot.similar} display={display} /> : null}
      </div>

      {isActive ? (
        <MobileBidBar
          auctionId={lot.auctionId}
          state={lot.state}
          currentBidAed={lot.currentBidAed}
          endsAt={lot.endsAt}
          display={display}
        />
      ) : null}
    </MarketShell>
  );
}
