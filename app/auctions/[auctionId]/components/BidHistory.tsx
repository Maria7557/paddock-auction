import type { DisplaySettings } from "@/src/lib/money";
import { formatMoneyFromAed } from "@/src/lib/money";
import { toIntlLocale } from "@/src/i18n/routing";

import styles from "./BidHistory.module.css";

type Bid = {
  id: string;
  maskedBidder: string;
  amountAed: number;
  placedAt: string;
};

export function BidHistory({ bids, display }: { bids: Bid[]; display: DisplaySettings }) {
  const isRu = display.locale === "ru";

  return (
    <section className={styles.card} aria-labelledby="bh-heading">
      <h2 id="bh-heading" className={styles.title}>
        {isRu ? "История ставок" : "Bid History"}
      </h2>

      {bids.length === 0 ? (
        <div className={styles.empty}>
          <p>{isRu ? "Пока нет ставок. Станьте первым участником торгов." : "No bids placed yet. Be the first to bid on this lot."}</p>
        </div>
      ) : (
        <table className={styles.table} aria-label={isRu ? "История ставок" : "Bid history"}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{isRu ? "Участник" : "Bidder"}</th>
              <th scope="col">{isRu ? "Сумма" : "Amount"}</th>
              <th scope="col">{isRu ? "Время" : "Time"}</th>
            </tr>
          </thead>
          <tbody>
            {bids.map((bid, index) => (
              <tr key={bid.id} className={index === 0 ? styles.topBid : ""}>
                <td className={styles.rank}>{index === 0 ? (isRu ? "Лидер" : "Top") : index + 1}</td>
                <td className={styles.bidder}>{bid.maskedBidder}</td>
                <td className={styles.amount}>{formatMoneyFromAed(bid.amountAed, display)}</td>
                <td className={styles.time}>
                  {new Date(bid.placedAt).toLocaleTimeString(toIntlLocale(display.locale), {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
