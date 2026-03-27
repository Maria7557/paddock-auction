import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EventLiveRoom } from "@/src/components/auction/EventLiveRoom";
import { api } from "@/src/lib/api-client";
import { mapServerLotToEventLotView } from "@/src/lib/event-live-lot";
import { withServerCookies } from "@/src/lib/server-api-options";
import type { EventRuntime } from "@/src/types/auction";
import { getLot } from "@/app/auctions/[auctionId]/lot-data";

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventId } = await params;
  const requestOptions = await withServerCookies({
    cache: "no-store",
  });

  const runtime = await api.events.getRuntime(eventId, requestOptions).catch(() => null as EventRuntime | null);

  if (!runtime?.currentLot) {
    return {
      title: "Live Event | FleetBid",
    };
  }

  const lot = await getLot(runtime.currentLot.auctionId);

  if (!lot) {
    return {
      title: "Live Event | FleetBid",
    };
  }

  return {
    title: `${lot.year} ${lot.make} ${lot.model} — Live Auction | FleetBid`,
  };
}

export default async function EventLivePage({ params }: PageProps) {
  const { eventId } = await params;
  const requestOptions = await withServerCookies({
    cache: "no-store",
  });
  const initialRuntime = await api.events.getRuntime(eventId, requestOptions).catch(() => null as EventRuntime | null);

  if (!initialRuntime) {
    notFound();
  }

  const initialLot = initialRuntime.currentLot ? await getLot(initialRuntime.currentLot.auctionId) : null;

  return (
    <EventLiveRoom
      eventId={eventId}
      initialRuntime={initialRuntime}
      initialLot={initialLot ? mapServerLotToEventLotView(initialLot) : null}
    />
  );
}
