import styles from './AuctionTicker.module.css';
import type { AuctionWeekEvent } from '@/src/types/auction';

interface Props { event: AuctionWeekEvent; }

export default function AuctionTicker({ event }: Props) {
  const date = new Date(event.date);
  const dateStr = date.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
  });

  const item = (
    <div className={styles.item}>
      <span className={styles.livePill}>
        <span className="live-dot" />
        LIVE
      </span>
      <strong>Next Auction: {dateStr} — {timeStr} GST</strong>
      <span className={styles.sep}>·</span>
      {event.lotCount} lots confirmed
      <span className={styles.sep}>·</span>
      {event.location}
      <span className={styles.sep}>·</span>
      Starting from AED {event.startingFromAed.toLocaleString('en-US')}
    </div>
  );

  return (
    <div className={styles.bar}>
      <div className={styles.track}>
        {item}{item}
      </div>
    </div>
  );
}
