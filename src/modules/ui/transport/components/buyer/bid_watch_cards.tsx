import Link from "next/link";

import type { SupportedLocale } from "@/src/i18n/routing";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import {
  type MyBidReadModel,
  formatAed,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";
import { AuctionStatusBadge } from "@/src/modules/ui/transport/components/shared/auction_status_badge";

type BidWatchCardsProps = {
  items: MyBidReadModel[];
  mode: "BIDS" | "WATCHLIST";
  locale: SupportedLocale;
};

export function BidWatchCards({ items, mode, locale }: BidWatchCardsProps) {
  const t = getBuyerPortalCopy(locale);

  return (
    <section className="cards-stack" aria-label={mode === "BIDS" ? t.bidWatch.ariaBids : t.bidWatch.ariaWatchlist}>
      {items.map((item) => (
        <article key={item.id} className="bid-watch-card">
          <div>
            <p className="card-eyebrow">{item.lotNumber}</p>
            <h3>{item.lotTitle}</h3>
            <div className="chip-row">
              <AuctionStatusBadge status={item.status} locale={locale} />
              {mode === "BIDS" ? (
                <span className={`small-pill ${item.isWinning ? "is-positive" : "is-warning"}`}>
                  {item.isWinning ? t.bidWatch.winning : t.bidWatch.outbid}
                </span>
              ) : null}
            </div>
          </div>

          <div className="bid-watch-values">
            {mode === "BIDS" ? (
              <p>
                {t.bidWatch.myBid}: <strong>{formatAed(item.myBidAed, locale)}</strong>
              </p>
            ) : null}
            <p>
              {t.bidWatch.highest}: <strong>{formatAed(item.highestBidAed, locale)}</strong>
            </p>
            <LiveCountdown targetIso={item.endsAt} prefix={t.bidWatch.endsIn} className="small-countdown" />
          </div>

          <Link href={`/auctions/${item.auctionId}`} className="button button-ghost">
            {t.bidWatch.openLot}
          </Link>
        </article>
      ))}
    </section>
  );
}
