import type { DisplaySettings } from "@/src/lib/money";
import { formatAed } from "@/src/lib/utils";

import styles from "./BidHistory.module.css";

type Bid = {
  id: string;
  maskedBidder: string;
  amountAed: number;
  placedAt: string;
};

function getTimeAgo(placedAt: string, locale: DisplaySettings["locale"]): string {
  const deltaMs = new Date(placedAt).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    numeric: "auto",
  });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];

  for (const [unit, value] of units) {
    const delta = Math.round(deltaMs / value);

    if (Math.abs(delta) >= 1) {
      return formatter.format(delta, unit);
    }
  }

  return locale === "ru" ? "только что" : "just now";
}

export function BidHistory({ bids, display }: { bids: Bid[]; display: DisplaySettings }) {
  const isRu = display.locale === "ru";
  const highestBid = bids.reduce((max, bid) => Math.max(max, bid.amountAed), 0);

  return (
    <section className={styles.section} aria-labelledby="bid-history-title">
      <div className={styles.header}>
        <h2 id="bid-history-title" className={styles.title}>
          {isRu ? "История ставок" : "Bid history"}
        </h2>
      </div>

      {bids.length === 0 ? (
        <div className={styles.empty}>
          {isRu ? "Пока нет ставок. Станьте первым участником торгов." : "No bids placed yet. Be the first to bid on this lot."}
        </div>
      ) : (
        <div className={styles.list}>
          {bids.map((bid) => (
            <div key={bid.id} className={styles.row}>
              <span className={styles.bidder}>{bid.maskedBidder}</span>
              <span className={styles.timeAgo}>{getTimeAgo(bid.placedAt, display.locale)}</span>
              <span className={`${styles.amount} ${bid.amountAed === highestBid ? styles.amountLead : ""}`}>
                {formatAed(bid.amountAed)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
