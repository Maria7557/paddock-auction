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
import GlobalFooter from "@/components/shell/GlobalFooter";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";
import { readHomepageLots, type AuctionLot } from "@/src/modules/ui/domain/marketplace_read_model";
import type { AuctionWeekEvent, Lot, LotStatus } from "@/src/types/auction";

export const metadata: Metadata = {
  title: "FleetBid — Dubai Rent A Car Liquidation Auctions",
  description:
    "Buy UAE fleet vehicles at up to 50% below market price. Structured weekly auctions of fully-serviced rental cars.",
};

export const dynamic = "force-dynamic";

type HomeCategory = {
  slug: string;
  label: string;
  sub: string;
  image: string;
  href?: string;
};

const CATEGORY_ORDER = ["luxury", "suv", "sedan", "sports"] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  luxury: "Luxury Fleet",
  suv: "SUV Inventory",
  sedan: "Fleet Sedans",
  sports: "Sports & Coupes",
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

function inferCategory(make: string, bodyType: string): string {
  const normalizedMake = make.toLowerCase();
  const normalizedBody = bodyType.toLowerCase();

  if (normalizedBody.includes("suv")) {
    return "suv";
  }

  if (
    ["bentley", "ferrari", "lamborghini", "rolls-royce", "mclaren", "maserati"].some((brand) =>
      normalizedMake.includes(brand),
    )
  ) {
    return "luxury";
  }

  if (normalizedBody.includes("coupe") || normalizedBody.includes("sport")) {
    return "sports";
  }

  return "sedan";
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
    category: inferCategory(lot.make, bodyType),
    status: mapStatus(lot.status),
    currentBidAed: lot.currentBidAed,
    startingBidAed: lot.currentBidAed,
    marketPriceAed: lot.marketPriceAed ?? null,
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

  return CATEGORY_ORDER.flatMap((slug) => {
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
        label: CATEGORY_LABELS[slug],
        sub: makes.join(", ") || `${group.length} lots`,
        image,
        href: "/auctions",
      },
    ];
  });
}

export default async function HomePage() {
  const display = await getPublicDisplaySettings();
  const lots = sortHomeLots((await readHomepageLots()).map(mapToHomeLot));
  const tickerEvent = buildTickerEvent(lots);
  const heroLot = lots.find((lot) => lot.status === "LIVE") ?? lots.find((lot) => lot.status === "SCHEDULED") ?? null;
  const categories = buildHomepageCategories(lots);

  return (
    <>
      {tickerEvent ? <AuctionTicker event={tickerEvent} display={display} /> : null}
      <HeroSection stats={null} heroLot={heroLot} display={display} />
      <LotsSection lots={lots} totalCount={lots.length} display={display} />
      <WhatSection locale={display.locale} />
      <WhySection locale={display.locale} />
      <HowSection locale={display.locale} />
      {tickerEvent ? <WeekSection event={tickerEvent} display={display} /> : null}
      {categories.length > 0 ? <CatsSection categories={categories} locale={display.locale} /> : null}
      <SellSection locale={display.locale} />
      <TrustSection locale={display.locale} />
      <GlobalFooter locale={display.locale} />
    </>
  );
}
