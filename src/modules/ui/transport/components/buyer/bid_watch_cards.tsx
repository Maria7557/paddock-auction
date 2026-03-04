import Link from "next/link";

import {
  type MyBidReadModel,
  formatAed,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";
import { AuctionStatusBadge } from "@/src/modules/ui/transport/components/shared/auction_status_badge";

type BidWatchCardsProps = {
  items: MyBidReadModel[];
  mode: "BIDS" | "WATCHLIST";
};

export function BidWatchCards({ items, mode }: BidWatchCardsProps) {
  return (
    <section className="cards-stack" aria-label={mode === "BIDS" ? "My bids" : "Watchlist"}>
      {items.map((item) => (
        <article key={item.id} className="bid-watch-card">
          <div>
            <p className="card-eyebrow">{item.lotNumber}</p>
            <h3>{item.lotTitle}</h3>
            <div className="chip-row">
              <AuctionStatusBadge status={item.status} />
              {mode === "BIDS" ? (
                <span className={`small-pill ${item.isWinning ? "is-positive" : "is-warning"}`}>
                  {item.isWinning ? "Winning" : "Outbid"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="bid-watch-values">
            {mode === "BIDS" ? (
              <p>
                My bid: <strong>{formatAed(item.myBidAed)}</strong>
              </p>
            ) : null}
            <p>
              Highest: <strong>{formatAed(item.highestBidAed)}</strong>
            </p>
            <LiveCountdown targetIso={item.endsAt} prefix="Ends in" className="small-countdown" />
          </div>

          <Link href={`/auctions/${item.auctionId}`} className="button button-ghost">
            Open lot
          </Link>
        </article>
      ))}
    </section>
  );
}
