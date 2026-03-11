// app/lot/[id]/components/BidHistory.tsx
// Server component — pure display

import { formatAed } from '@/src/lib/utils';
import styles from './BidHistory.module.css';

type Bid = {
  id:           string;
  maskedBidder: string;
  amountAed:    number;
  placedAt:     string;
};

export function BidHistory({ bids }: { bids: Bid[] }) {
  return (
    <section className={styles.card} aria-labelledby="bh-heading">
      <h2 id="bh-heading" className={styles.title}>Bid History</h2>

      {bids.length === 0 ? (
        <div className={styles.empty}>
          <span aria-hidden>🏷️</span>
          <p>No bids placed yet. Be the first to bid on this lot.</p>
        </div>
      ) : (
        <table className={styles.table} aria-label="Bid history">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Bidder</th>
              <th scope="col">Amount</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {bids.map((bid, i) => (
              <tr key={bid.id} className={i === 0 ? styles.topBid : ''}>
                <td className={styles.rank}>
                  {i === 0 ? <span className={styles.crown} aria-label="Leading bid">👑</span> : i + 1}
                </td>
                <td className={styles.bidder}>{bid.maskedBidder}</td>
                <td className={styles.amount}>{formatAed(bid.amountAed)}</td>
                <td className={styles.time}>
                  {new Date(bid.placedAt).toLocaleTimeString('en-GB', {
                    hour:   '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
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
