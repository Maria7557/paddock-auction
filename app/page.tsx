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
import { FEATURED_LOTS, NEXT_AUCTION, PLATFORM_STATS, CATEGORIES } from "@/src/lib/data";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";
import { readHomepageLots, type AuctionLot } from "@/src/modules/ui/domain/marketplace_read_model";
import type { Lot, LotStatus } from "@/src/types/auction";

export const metadata: Metadata = {
  title: "FleetBid — Dubai Rent A Car Liquidation Auctions",
  description:
    "Buy UAE fleet vehicles at up to 50% below market price. Structured weekly auctions of fully-serviced rental cars.",
};

function getSpec(lot: AuctionLot, label: string, fallback: string): string {
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
  const fuelType = getSpec(lot, "Fuel", "Petrol");
  const bodyType = getSpec(lot, "Body Type", "Sedan");
  const regionSpec = getSpec(lot, "Region", "GCC");
  const color = getSpec(lot, "Color", "Unknown");
  const condition = getSpec(lot, "Condition", "Good");
  const startingBidAed = Math.max(lot.currentBidAed - lot.minimumStepAed * 5, 0);
  const marketPriceAed = lot.marketPriceAed ?? Math.round(lot.currentBidAed * 1.25);

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
    startingBidAed,
    marketPriceAed,
    minStepAed: lot.minimumStepAed,
    startsAt: lot.startsAt,
    endsAt: lot.endsAt,
    imageUrl: lot.images[0] ?? "/vehicle-photo.svg",
    totalBids: 0,
  };
}

export default async function HomePage() {
  const display = await getPublicDisplaySettings();
  const dbLots = await readHomepageLots();
  const activeLots = dbLots.filter((lot) => lot.status === "LIVE" || lot.status === "SCHEDULED");
  const nextAuction = [...activeLots].sort(
    (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  )[0];
  const scheduledLots = activeLots.filter((lot) => lot.status === "SCHEDULED");
  const pricePool = scheduledLots.length > 0 ? scheduledLots : activeLots;
  const startingFromAed =
    pricePool.length > 0
      ? Math.min(...pricePool.map((lot) => lot.currentBidAed))
      : NEXT_AUCTION.startingFromAed;

  const tickerEvent = {
    date: nextAuction?.startsAt ?? NEXT_AUCTION.date,
    lotCount: activeLots.length || NEXT_AUCTION.lotCount,
    startingFromAed,
    location: "Dubai Warehouse · Al Quoz Industrial Area",
    viewingStart: NEXT_AUCTION.viewingStart,
    viewingEnd: NEXT_AUCTION.viewingEnd,
  };

  const lots = dbLots.length > 0 ? dbLots.map(mapToHomeLot) : FEATURED_LOTS;
  const heroLot = lots.find((lot) => lot.status === "LIVE") ?? lots[0];

  return (
    <>
      <AuctionTicker event={tickerEvent} display={display} />
      <HeroSection stats={PLATFORM_STATS} heroLot={heroLot} display={display} />
      <LotsSection lots={lots} totalCount={Math.max(tickerEvent.lotCount, lots.length)} display={display} />
      <WhatSection locale={display.locale} />
      <WhySection locale={display.locale} />
      <HowSection locale={display.locale} />
      <WeekSection event={tickerEvent} display={display} />
      <CatsSection categories={CATEGORIES} locale={display.locale} />
      <SellSection locale={display.locale} />
      <TrustSection locale={display.locale} />
      <GlobalFooter locale={display.locale} />
    </>
  );
}
