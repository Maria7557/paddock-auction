"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type AuctionBidHistoryEntry,
  formatAed,
  formatShortDateTime,
} from "@/src/modules/ui/domain/marketplace_read_model";

type LiveBidHistoryProps = {
  auctionId: string;
  initialEntries: AuctionBidHistoryEntry[];
};

type BidHistoryApiEntry = {
  id: string;
  bidder_alias: string;
  amount_aed: number;
  placed_at: string;
  sequence_no: number;
  is_mine: boolean;
};

function normalize(entries: BidHistoryApiEntry[]): AuctionBidHistoryEntry[] {
  return entries
    .map((entry) => ({
      id: entry.id,
      auctionId: "",
      bidderAlias: entry.bidder_alias,
      amountAed: entry.amount_aed,
      placedAt: entry.placed_at,
      sequenceNo: entry.sequence_no,
      isMine: entry.is_mine,
    }))
    .sort((left, right) => right.sequenceNo - left.sequenceNo);
}

export function LiveBidHistory({ auctionId, initialEntries }: LiveBidHistoryProps) {
  const [entries, setEntries] = useState<AuctionBidHistoryEntry[]>(
    initialEntries.slice().sort((left, right) => right.sequenceNo - left.sequenceNo),
  );

  useEffect(() => {
    let active = true;

    const pull = async () => {
      try {
        const response = await fetch(`/api/ui/auctions/${auctionId}/bids`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { bids?: BidHistoryApiEntry[] };

        if (!active) {
          return;
        }

        if (Array.isArray(payload.bids)) {
          setEntries(normalize(payload.bids));
        }
      } catch {
        // silent polling failures; UI keeps latest known history.
      }
    };

    const intervalId = window.setInterval(() => {
      void pull();
    }, 5000);

    void pull();

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [auctionId]);

  const topBid = useMemo(() => entries[0] ?? null, [entries]);

  return (
    <section className="surface-panel">
      <div className="section-heading compact">
        <h2>Bid history</h2>
        <p>{topBid ? `Latest: ${formatAed(topBid.amountAed)}` : "No accepted bids yet"}</p>
      </div>

      <ul className="live-bid-list" aria-label="Latest bids">
        {entries.map((entry) => (
          <li key={entry.id} className={entry.isMine ? "is-mine" : undefined}>
            <span>#{entry.sequenceNo}</span>
            <span>{entry.bidderAlias}</span>
            <strong>{formatAed(entry.amountAed)}</strong>
            <span>{formatShortDateTime(entry.placedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
