import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withLocalePath } from "@/src/i18n/routing";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";
import { formatInteger } from "@/src/lib/money";
import { formatAed } from "@/src/lib/utils";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

import { getLot } from "./lot-data";
import type { LotDetail } from "./types";
import { BidHistory } from "./components/BidHistory";
import { BidPanel } from "./components/BidPanel";
import { InspectionSection } from "./components/InspectionSection";
import { LotGallery } from "./components/LotGallery";
import { MobileBidBar } from "./components/MobileBidBar";
import { VehicleDesc } from "./components/VehicleDesc";
import { VehicleFeatures } from "./components/VehicleFeatures";
import { VehicleInfo } from "./components/VehicleInfo";

import styles from "./page.module.css";

export type { LotDetail } from "./types";

function buildPageTitle(lot: LotDetail): string {
  return lot.title;
}

function maskVin(vin: string): string {
  const cleanVin = vin.replace(/\s+/g, "");

  if (cleanVin.length <= 8) {
    return `•••${cleanVin}`;
  }

  return `•••${cleanVin.slice(-8)}`;
}

function hasServiceHistory(value: string): boolean {
  return value.trim().length > 0 && value !== "Not specified";
}

function getTagTone(input: {
  label: string;
  isPositive?: boolean;
  isInfo?: boolean;
}): string {
  if (input.isPositive) {
    return styles.tagPositive;
  }

  if (input.isInfo) {
    return styles.tagInfo;
  }

  return styles.tagNeutral;
}

export async function generateMetadata({ params }: { params: Promise<{ auctionId: string }> }): Promise<Metadata> {
  const { auctionId } = await params;
  const lot = await getLot(auctionId);
  const display = await getPublicDisplaySettings();
  const isRu = display.locale === "ru";

  if (!lot) {
    return {
      title: isRu ? "Лот не найден" : "Lot not found",
    };
  }

  const pageTitle = buildPageTitle(lot);

  return {
    title: `${pageTitle} — Lot #${lot.lotNumber}`,
    description: isRu
      ? `${pageTitle}, ${formatInteger(lot.mileageKm, display.locale)} км, ${lot.regionSpec}. Текущая ставка ${formatAed(lot.currentBidAed)}.`
      : `${pageTitle}, ${formatInteger(lot.mileageKm, display.locale)} km, ${lot.regionSpec}. Current bid ${formatAed(lot.currentBidAed)}.`,
    openGraph: {
      title: `${pageTitle} — Lot #${lot.lotNumber}`,
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

  const pageTitle = buildPageTitle(lot);
  const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
  const isScheduled = lot.state === "SCHEDULED";
  const isActive = isLive || isScheduled;
  const tagItems = [
    { key: "year", label: String(lot.year) },
    { key: "mileage", label: `${formatInteger(lot.mileageKm, display.locale)} KM` },
    { key: "region", label: lot.regionSpec },
    {
      key: "startCode",
      label: lot.startCode,
      isPositive: lot.startCode === "Run & Drive",
    },
    {
      key: "keys",
      label: `${lot.numberOfKeys} ${isRu ? "ключа" : lot.numberOfKeys === 1 ? "key" : "keys"}`,
      isInfo: lot.numberOfKeys > 0,
    },
    { key: "fuel", label: lot.fuelType },
    {
      key: "history",
      label: isRu ? "История сервиса" : "Service history",
      isPositive: hasServiceHistory(lot.serviceHistory),
      hidden: !hasServiceHistory(lot.serviceHistory),
    },
  ].filter((item) => !item.hidden && item.label && item.label !== "Not specified");

  return (
    <MarketShell mainClassName={styles.mainTight}>
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label={isRu ? "Хлебные крошки" : "Breadcrumb"}>
          <Link href={withLocalePath("/", display.locale)}>{isRu ? "Главная" : "Home"}</Link>
          <span aria-hidden>›</span>
          <Link href={withLocalePath("/auctions", display.locale)}>{isRu ? "Аукционы" : "Auctions"}</Link>
          <span aria-hidden>›</span>
          <span>{[lot.make, lot.model, lot.year > 0 ? String(lot.year) : ""].filter(Boolean).join(" ")}</span>
        </nav>

        <header className={styles.header}>
          <div className={styles.kickerRow}>
            <span className={styles.kickerText}>LOT #{lot.lotNumber}</span>
            <span className={styles.kickerDot} aria-hidden>
              ·
            </span>
            <span className={styles.kickerText}>{maskVin(lot.vin)}</span>
          </div>

          <h1 className={styles.title}>{pageTitle}</h1>

          <div className={styles.tagRow}>
            {tagItems.map((item) => (
              <span
                key={item.key}
                className={`${styles.tag} ${getTagTone({
                  label: item.label,
                  isPositive: item.isPositive,
                  isInfo: item.isInfo,
                })}`}
              >
                {item.label}
              </span>
            ))}
          </div>
        </header>

        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <LotGallery images={lot.images} title={pageTitle} locale={display.locale} />
            <VehicleInfo lot={lot} locale={display.locale} />
            <VehicleDesc lot={lot} locale={display.locale} />
            <VehicleFeatures features={lot.features} locale={display.locale} />
            <InspectionSection
              auctionId={lot.auctionId}
              startsAt={lot.startsAt}
              location={lot.location}
              locale={display.locale}
            />
            <BidHistory bids={lot.bids} display={display} />
          </div>

          <aside className={styles.sidebar}>
            <BidPanel lot={lot} totalBids={lot.totalBids} display={display} />
          </aside>
        </div>
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
