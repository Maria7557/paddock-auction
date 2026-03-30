import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AuctionLiveRoom } from "@/src/components/auction/AuctionLiveRoom";
import { withLocalePath } from "@/src/i18n/routing";
import { api } from "@/src/lib/api-client";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { withServerCookies } from "@/src/lib/server-api-options";
import type { AuctionLiveSnapshot } from "@/src/types/auction";
import { getLot } from "@/app/auctions/[auctionId]/lot-data";

type PageProps = {
  params: Promise<{
    auctionId: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { auctionId } = await params;
  const lot = await getLot(auctionId);

  if (!lot) {
    return {
      title: "Live Auction | FleetBid",
    };
  }

  return {
    title: `${lot.title} — Live Auction | FleetBid`,
  };
}

export default async function LiveAuctionPage({ params }: PageProps) {
  const { auctionId } = await params;
  const locale = await getLocalePreference();
  const requestOptions = await withServerCookies({
    cache: "no-store",
  });
  const activeEvent = await api.events.getByAuction(auctionId, requestOptions);

  if (activeEvent?.eventId) {
    redirect(withLocalePath(`/auctions/live/event/${activeEvent.eventId}`, locale));
  }

  const [lot, initialSnapshot] = await Promise.all([
    getLot(auctionId),
    api.auctions.getLiveSnapshot(auctionId, requestOptions).catch(() => null as AuctionLiveSnapshot | null),
  ]);

  if (!lot || !initialSnapshot) {
    notFound();
  }

  return <AuctionLiveRoom auctionId={auctionId} initialSnapshot={initialSnapshot} lot={lot} />;
}
