import type { Metadata } from "next";

import AuctionTicker from "@/components/home/AuctionTicker";
import HeroSection from "@/components/home/HeroSection";
import {
  CatsSection,
  HowSection,
  SellSection,
  TrustSection,
  WeekSection,
  WhatSection,
  WhySection,
} from "@/components/home/HomeSections";
import LotsSection from "@/components/home/LotsSection";
import { PLATFORM_STATS } from "@/src/lib/data";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";
import {
  AUCTION_CATEGORY_LABELS,
  AUCTION_CATEGORY_ORDER,
  inferAuctionCategory,
  type AuctionCategory,
} from "@/src/modules/ui/domain/auction_category";
import { readHomepageLots, type AuctionLot } from "@/src/modules/ui/domain/marketplace_read_model";
import type { AuctionWeekEvent, Lot, LotStatus } from "@/src/types/auction";

export const metadata: Metadata = {
  description:
    "Buy UAE fleet vehicles at up to 50% below market price. Structured weekly auctions of fully-serviced rental cars.",
};

export const dynamic = "force-dynamic";

type HomeCategory = {
  slug: AuctionCategory;
  label: string;
  sub: string;
  image: string;
  href?: string;
};

function getSpec(lot: AuctionLot, label: string, fallback = ""): string {
  const value = lot.specs.find((spec) => spec.label.toLowerCase() === label.toLowerCase())?.value;
  return value ?? fallback;
}

function mapStatus(status: AuctionLot["status"]): LotStatus {
  if (status === "LIVE" || status === "SCHEDULED") {
    return status;
  }

  return "CLOSED";
}

function mapToHomeLot(lot: AuctionLot): Lot {
  const fuelType = getSpec(lot, "Fuel");
  const bodyType = getSpec(lot, "Body Type");
  const regionSpec = getSpec(lot, "Region");
  const color = getSpec(lot, "Color");
  const condition = getSpec(lot, "Condition");

  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    make: lot.make,
    model: lot.model,
    year: lot.year,
    mileageKm: lot.mileageKm,
    condition,
    fuelType,
    bodyType,
    regionSpec,
    color,
    emirate: lot.location,
    category: inferAuctionCategory(lot.make, bodyType),
    status: mapStatus(lot.status),
    currentBidAed: lot.currentBidAed,
    startingBidAed: lot.currentBidAed,
    marketPriceAed: lot.marketPriceAed ?? null,
    buyNowPriceAed: lot.buyNowPriceAed ?? null,
    minStepAed: lot.minimumStepAed,
    startsAt: lot.startsAt,
    endsAt: lot.endsAt,
    imageUrl: lot.images[0] ?? "/vehicle-photo.svg",
    totalBids: 0,
  };
}

function sortHomeLots(lots: Lot[]): Lot[] {
  return [...lots].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "LIVE" ? -1 : 1;
    }

    const leftDate = new Date(left.status === "LIVE" ? left.endsAt : left.startsAt).getTime();
    const rightDate = new Date(right.status === "LIVE" ? right.endsAt : right.startsAt).getTime();

    return leftDate - rightDate;
  });
}

function buildTickerEvent(lots: Lot[]): AuctionWeekEvent | null {
  if (lots.length === 0) {
    return null;
  }

  const liveLot = lots.find((lot) => lot.status === "LIVE");
  const referenceLot = liveLot ?? lots.find((lot) => lot.status === "SCHEDULED") ?? lots[0];
  const positivePrices = lots.map((lot) => lot.currentBidAed).filter((price) => price > 0);

  return {
    date: referenceLot.status === "LIVE" ? referenceLot.endsAt : referenceLot.startsAt,
    lotCount: lots.length,
    startingFromAed: positivePrices.length > 0 ? Math.min(...positivePrices) : 0,
    location: referenceLot.emirate,
    viewingStart: null,
    viewingEnd: null,
    status: referenceLot.status === "LIVE" ? "LIVE" : "SCHEDULED",
  };
}

function buildHomepageCategories(lots: Lot[]): HomeCategory[] {
  const groups = new Map<string, Lot[]>();

  for (const lot of lots) {
    const existing = groups.get(lot.category) ?? [];
    existing.push(lot);
    groups.set(lot.category, existing);
  }

  return AUCTION_CATEGORY_ORDER.flatMap((slug) => {
    const group = groups.get(slug);

    if (!group || group.length === 0) {
      return [];
    }

    const makes = Array.from(new Set(group.map((lot) => lot.make).filter(Boolean))).slice(0, 3);
    const image =
      group.find((lot) => lot.imageUrl && lot.imageUrl !== "/vehicle-photo.svg")?.imageUrl ??
      group[0]?.imageUrl ??
      "/vehicle-photo.svg";

    return [
      {
        slug,
        label: AUCTION_CATEGORY_LABELS[slug],
        sub: makes.join(", ") || `${group.length} lots`,
        image,
        href: `/auctions?category=${slug}`,
      },
    ];
  });
}

export default async function HomePage() {
  const display = await getPublicDisplaySettings();
  const homepageAuctionLots = await readHomepageLots();
  const lots = sortHomeLots(homepageAuctionLots.map(mapToHomeLot));
  const tickerEvent = buildTickerEvent(lots);
  const heroLot = lots.find((lot) => lot.status === "LIVE") ?? lots.find((lot) => lot.status === "SCHEDULED") ?? null;
  const categories = buildHomepageCategories(lots);

  return (
    <>
      {tickerEvent ? <AuctionTicker event={tickerEvent} display={display} /> : null}
      <HeroSection stats={PLATFORM_STATS} heroLot={heroLot} display={display} />
      <LotsSection lots={homepageAuctionLots} totalCount={homepageAuctionLots.length} display={display} />
      <WhatSection locale={display.locale} />
      <WhySection locale={display.locale} />
      <HowSection locale={display.locale} />
      {tickerEvent ? <WeekSection event={tickerEvent} display={display} /> : null}
      {categories.length > 0 ? <CatsSection categories={categories} locale={display.locale} /> : null}
      <SellSection locale={display.locale} />
      <TrustSection locale={display.locale} />
    </>
  );
}
