import { notFound } from "next/navigation";

import { type UiAuctionBidHistoryEntry, api } from "@/src/lib/api-client";
import { mapAuctionPayloadToEventLotView, type EventLotView } from "@/src/lib/event-live-lot";
import { withServerCookies } from "@/src/lib/server-api-options";

import { EventConsoleClient } from "../EventConsoleClient";

export const dynamic = "force-dynamic";

async function getInitialCurrentLotState(
  auctionId: string,
  requestOptions: RequestInit,
): Promise<{ lot: EventLotView | null; leader: UiAuctionBidHistoryEntry | null }> {
  const [auctionPayload, bidPayload] = await Promise.all([
    api.auctions.get<Record<string, unknown>>(auctionId, requestOptions).catch(() => null),
    api.ui.auctions.bids(auctionId, { limit: 1 }, requestOptions).catch(() => ({ bids: [] })),
  ]);

  return {
    lot: auctionPayload ? mapAuctionPayloadToEventLotView(auctionPayload, auctionId) : null,
    leader: bidPayload.bids[0] ?? null,
  };
}

export default async function AdminEventConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const [runtime, results, lotsPayload] = await Promise.all([
    api.admin.events.getEventConsole(id, requestOptions).catch(() => null),
    api.admin.events.getEventResults(id, requestOptions).catch(() => null),
    api.admin.events.getAdminEventLots(id, requestOptions).catch(() => null),
  ]);

  if (!runtime || !results || !lotsPayload) {
    notFound();
  }

  const currentLotState = runtime.currentLot
    ? await getInitialCurrentLotState(runtime.currentLot.auctionId, requestOptions)
    : { lot: null, leader: null };

  return (
    <EventConsoleClient
      eventId={id}
      eventTitle={lotsPayload.event.title}
      initialRuntime={runtime}
      initialResults={results}
      initialLot={currentLotState.lot}
      initialLeader={currentLotState.leader}
    />
  );
}
