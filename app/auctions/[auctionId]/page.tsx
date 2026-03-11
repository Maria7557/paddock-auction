import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatAed } from "@/src/lib/utils";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

import { BidHistory } from "./components/BidHistory";
import { BidPanel } from "./components/BidPanel";
import { InspectionSection } from "./components/InspectionSection";
import { LotGallery } from "./components/LotGallery";
import { MobileBidBar } from "./components/MobileBidBar";
import { SaleInfo } from "./components/SaleInfo";
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

const DEFAULT_FEATURES = [
  "Bluetooth Connectivity",
  "Rear Camera",
  "Cruise Control",
  "Parking Sensors",
  "Keyless Entry",
  "Push Start",
  "Climate Control",
  "Navigation System",
  "Leather Seats",
  "Sunroof",
];

const DEFAULT_DESCRIPTION =
  "Fleet vehicle from a UAE rental operator. This vehicle was part of an active rental fleet and has been regularly serviced and maintained according to manufacturer specifications.";

const DEFAULT_HIGHLIGHTS = [
  "Fully operational",
  "Fleet maintained",
  "Transparent history",
  "Not insurance salvage",
  "Not damaged liquidation stock",
];

async function getLot(auctionId: string): Promise<LotDetail | null> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const response = await fetch(`${baseUrl}/api/auctions/${auctionId}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const vehicle = (data.vehicle ?? data) as Record<string, unknown>;
    const auction = data.auction ? (data.auction as Record<string, unknown>) : data;

    return {
      id: String(auction.id ?? auctionId),
      lotNumber: String(auction.lotNumber ?? `LOT-${auctionId.slice(0, 8).toUpperCase()}`),
      auctionId: String(auction.id ?? auctionId),
      state: ((auction.state as LotAuctionState | undefined) ?? "SCHEDULED"),
      title: `${Number(vehicle.year ?? 2022)} ${String(vehicle.brand ?? vehicle.make ?? "")} ${String(vehicle.model ?? "")}`.trim(),
      make: String(vehicle.brand ?? vehicle.make ?? ""),
      model: String(vehicle.model ?? ""),
      series: String(vehicle.series ?? vehicle.trim ?? ""),
      year: Number(vehicle.year ?? 2022),
      vin: String(vehicle.vin ?? "—"),
      mileageKm: Number(vehicle.mileage ?? vehicle.mileageKm ?? 0),
      color: String(vehicle.exteriorColor ?? vehicle.color ?? "Not specified"),
      colorInterior: String(vehicle.interiorColor ?? "—"),
      condition: String(vehicle.condition ?? "Good"),
      regionSpec: String(vehicle.regionSpec ?? "GCC"),
      airbags: String(vehicle.airbags ?? "Intact"),
      damage: String(vehicle.damage ?? "None"),
      bodyStyle: String(vehicle.bodyType ?? vehicle.bodyStyle ?? "Sedan"),
      engine: String(vehicle.engine ?? "—"),
      transmission: String(vehicle.transmission ?? "Automatic"),
      driveType: String(vehicle.driveType ?? vehicle.drivetrain ?? "—"),
      fuelType: String(vehicle.fuelType ?? "Petrol"),
      features: Array.isArray(vehicle.features) ? (vehicle.features as string[]) : DEFAULT_FEATURES,
      description: String(vehicle.sellerNotes ?? vehicle.description ?? DEFAULT_DESCRIPTION),
      highlights: Array.isArray(vehicle.highlights) ? (vehicle.highlights as string[]) : DEFAULT_HIGHLIGHTS,
      sellerName: String(auction.sellerName ?? data.sellerName ?? "Fleet Operator"),
      sellerRef: String(auction.sellerRef ?? ""),
      location: String(auction.location ?? vehicle.location ?? "UAE, Dubai"),
      auctionAt: String(auction.startsAt ?? auction.endsAt ?? new Date().toISOString()),
      actualCashValue: Number(auction.actualCashValue ?? 0),
      currentBidAed: Number(auction.currentPrice ?? auction.currentBidAed ?? 0),
      buyNowAed: Number(auction.buyNowPrice ?? auction.buyNowAed ?? 0),
      minStepAed: Number(auction.minIncrement ?? auction.minStepAed ?? 500),
      endsAt: String(auction.endsAt ?? new Date(Date.now() + 3600_000).toISOString()),
      startsAt: String(auction.startsAt ?? new Date().toISOString()),
      images:
        Array.isArray(vehicle.images) && vehicle.images.length > 0
          ? (vehicle.images as string[])
          : ["/images/car-elantra.jpg", "/images/car-gwagon.jpg", "/images/car-bentley.jpg"],
      bids: Array.isArray(data.bids)
        ? (data.bids as Array<Record<string, unknown>>).map((bid) => ({
            id: String(bid.id ?? ""),
            maskedBidder: `Bidder ${String(bid.userId ?? "").slice(-4).toUpperCase()}`,
            amountAed: Number(bid.amount ?? 0),
            placedAt: String(bid.createdAt ?? new Date().toISOString()),
          }))
        : [],
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
              imageUrl: "/images/car-elantra.jpg",
            };
          })
        : [],
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}): Promise<Metadata> {
  const { auctionId } = await params;
  const lot = await getLot(auctionId);

  if (!lot) {
    return { title: "Lot Not Found — FleetBid" };
  }

  return {
    title: `${lot.title} — FleetBid Auction`,
    description: `${lot.title}, ${lot.mileageKm.toLocaleString()} km, ${lot.regionSpec} spec. Current bid ${formatAed(lot.currentBidAed)}.`,
    openGraph: {
      title: `${lot.title} — Lot #${lot.lotNumber}`,
      images: lot.images[0] ? [lot.images[0]] : [],
    },
  };
}

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const { auctionId } = await params;
  const lot = await getLot(auctionId);

  if (!lot) {
    notFound();
  }

  const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
  const isScheduled = lot.state === "SCHEDULED";
  const isActive = isLive || isScheduled;

  const stateLabel: Record<LotAuctionState, string> = {
    DRAFT: "Draft",
    SCHEDULED: "Scheduled",
    LIVE: "Live",
    EXTENDED: "Extended",
    PAYMENT_PENDING: "Payment Pending",
    ENDED: "Ended",
    DEFAULTED: "Defaulted",
    CLOSED: "Closed",
    PAID: "Paid",
    CANCELED: "Canceled",
    RELISTED: "Relisted",
  };

  return (
    <MarketShell>
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label="breadcrumb">
          <a href="/">Home</a>
          <span aria-hidden>›</span>
          <a href="/auctions">Auctions</a>
          <span aria-hidden>›</span>
          <span>{lot.title}</span>
        </nav>

        <div className={styles.titleBar}>
          <div className={styles.titleLeft}>
            <div className={styles.lotEyebrow}>
              Lot&nbsp;<span className={styles.lotNum}>#{lot.lotNumber}</span>
            </div>
            <h1 className={styles.h1}>{lot.title}</h1>
            <div className={styles.quickMeta}>
              <span>
                VIN: <strong>{maskVin(lot.vin)}</strong>
              </span>
              <span className={styles.dot}>·</span>
              <span>{lot.mileageKm.toLocaleString()}&thinsp;km</span>
              <span className={styles.dot}>·</span>
              <span>{lot.condition}</span>
              <span className={styles.dot}>·</span>
              <span>{lot.regionSpec}</span>
              <span className={styles.dot}>·</span>
              <span>{lot.airbags} airbags</span>
              {lot.damage !== "None" ? (
                <>
                  <span className={styles.dot}>·</span>
                  <span className={styles.damage}>⚠ {lot.damage}</span>
                </>
              ) : null}
            </div>
            <div className={styles.specPills}>
              <span className={styles.pill}>{lot.regionSpec}</span>
              <span className={styles.pill}>{lot.transmission}</span>
              <span className={styles.pill}>{lot.bodyStyle}</span>
            </div>
          </div>

          <div className={styles.statePill} data-state={lot.state} aria-label={`Auction state: ${stateLabel[lot.state]}`}>
            {isLive ? <span className={styles.livePulse} aria-hidden /> : null}
            {stateLabel[lot.state]}
          </div>
        </div>

        <div className={styles.hero}>
          <div className={styles.galleryCol}>
            <LotGallery images={lot.images} title={lot.title} />
          </div>
          <div className={styles.bidCol}>
            <BidPanel lot={lot} totalBids={lot.bids.length} />
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <VehicleInfo lot={lot} />
            <SaleInfo lot={lot} />
            <VehicleSpecs lot={lot} />
            <VehicleFeatures features={lot.features} />
            <VehicleDesc description={lot.description} highlights={lot.highlights} />
            <InspectionSection auctionId={lot.auctionId} startsAt={lot.startsAt} />
            <BidHistory bids={lot.bids} />
          </div>

          <aside className={styles.sideSticky}>
            <BidPanel lot={lot} compact totalBids={lot.bids.length} />
          </aside>
        </div>

        {lot.similar.length > 0 ? <SimilarVehicles lots={lot.similar} /> : null}
      </div>

      {isActive ? (
        <MobileBidBar
          auctionId={lot.auctionId}
          state={lot.state}
          currentBidAed={lot.currentBidAed}
          endsAt={lot.endsAt}
        />
      ) : null}
    </MarketShell>
  );
}

function maskVin(vin: string): string {
  if (!vin || vin === "—") {
    return "—";
  }

  if (vin.length <= 6) {
    return vin;
  }

  return `${vin.slice(0, 11)}******`;
}
