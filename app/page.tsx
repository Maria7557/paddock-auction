import type { Metadata } from 'next';
import { FEATURED_LOTS, NEXT_AUCTION, PLATFORM_STATS, CATEGORIES } from '@/src/lib/data';
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

export default async function HomePage() {
  const lots    = FEATURED_LOTS;
  const heroLot = lots.find(l => l.status === 'LIVE') ?? lots[0];

  return (
    <>
      <AuctionTicker event={NEXT_AUCTION} />
      <HeroSection stats={PLATFORM_STATS} heroLot={heroLot} />
      <LotsSection lots={lots} totalCount={NEXT_AUCTION.lotCount} />
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
