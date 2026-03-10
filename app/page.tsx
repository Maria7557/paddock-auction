import type { Metadata } from 'next';
import { FEATURED_LOTS, NEXT_AUCTION, PLATFORM_STATS, CATEGORIES } from '@/src/lib/data';
import { readHomepageLots, type AuctionLot } from '@/src/modules/ui/domain/marketplace_read_model';
import type { Lot, LotStatus } from '@/src/types/auction';
import AuctionTicker from '@/components/home/AuctionTicker';
import HeroSection   from '@/components/home/HeroSection';
import LotsSection   from '@/components/home/LotsSection';
import {
  WhatSection, WhySection, HowSection,
  WeekSection, CatsSection, SellSection, TrustSection,
} from '@/components/home/HomeSections';
import GlobalFooter from '@/components/shell/GlobalFooter';

export const metadata: Metadata = {
  title: 'FleetBid — Dubai Rent A Car Liquidation Auctions',
  description: 'Buy UAE fleet vehicles at up to 50% below market price. Structured weekly auctions of fully-serviced rental cars.',
};

function getSpec(lot: AuctionLot, label: string, fallback: string): string {
  const value = lot.specs.find((spec) => spec.label.toLowerCase() === label.toLowerCase())?.value;
  return value ?? fallback;
}

function mapStatus(status: AuctionLot['status']): LotStatus {
  if (status === 'LIVE' || status === 'SCHEDULED') {
    return status;
  }

  return 'CLOSED';
}

function inferCategory(make: string, bodyType: string): string {
  const normalizedMake = make.toLowerCase();
  const normalizedBody = bodyType.toLowerCase();

  if (normalizedBody.includes('suv')) {
    return 'suv';
  }

  if (['bentley', 'ferrari', 'lamborghini', 'rolls-royce', 'mclaren', 'maserati'].some((brand) => normalizedMake.includes(brand))) {
    return 'luxury';
  }

  if (normalizedBody.includes('coupe') || normalizedBody.includes('sport')) {
    return 'sports';
  }

  return 'sedan';
}

function mapToHomeLot(lot: AuctionLot): Lot {
  const fuelType = getSpec(lot, 'Fuel', 'Petrol');
  const bodyType = getSpec(lot, 'Body Type', 'Sedan');
  const regionSpec = getSpec(lot, 'Region', 'GCC');
  const color = getSpec(lot, 'Color', 'Unknown');
  const condition = getSpec(lot, 'Condition', 'Good');
  const startingBidAed = Math.max(lot.currentBidAed - lot.minimumStepAed * 5, 0);
  const marketPriceAed = Math.round(lot.currentBidAed * 1.25);

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
    imageUrl: lot.images[0] ?? '/vehicle-photo.svg',
    totalBids: 0,
  };
}

export default async function HomePage() {
  const dbLots = await readHomepageLots();
  const lots = dbLots.length > 0 ? dbLots.map(mapToHomeLot) : FEATURED_LOTS;
  const heroLot = lots.find((lot) => lot.status === 'LIVE') ?? lots[0];

  return (
    <>
      <AuctionTicker event={NEXT_AUCTION} />
      <HeroSection stats={PLATFORM_STATS} heroLot={heroLot} />
      <LotsSection lots={lots} totalCount={Math.max(NEXT_AUCTION.lotCount, lots.length)} />
      <WhatSection />
      <WhySection />
      <HowSection />
      <WeekSection event={NEXT_AUCTION} />
      <CatsSection categories={CATEGORIES} />
      <SellSection />
      <TrustSection />
      <GlobalFooter />
    </>
  );
}
