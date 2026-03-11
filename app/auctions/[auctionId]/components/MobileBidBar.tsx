'use client';
// app/lot/[id]/components/MobileBidBar.tsx
// Fixed bottom bar, visible on mobile only (<= 1080px)

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatAed, formatCountdown, pad } from '@/src/lib/utils';
import styles from './MobileBidBar.module.css';

type Props = {
  auctionId:    string;
  state:        string;
  currentBidAed: number;
  endsAt:       string;
};

export function MobileBidBar({ auctionId, state, currentBidAed, endsAt }: Props) {
  const isLive = state === 'LIVE' || state === 'EXTENDED';

  // Countdown
  const [cd, setCd] = useState(() =>
    formatCountdown(new Date(endsAt).getTime() - Date.now())
  );
  useEffect(() => {
    const t = setInterval(() => {
      setCd(formatCountdown(new Date(endsAt).getTime() - Date.now()));
    }, 1_000);
    return () => clearInterval(t);
  }, [endsAt]);

  return (
    <div className={styles.bar} role="complementary" aria-label="Quick bid">
      {/* Left: price + countdown */}
      <div className={styles.info}>
        <div className={styles.price}>{formatAed(currentBidAed)}</div>
        <div className={styles.cd}>
          {isLive ? 'Ends' : 'Starts'}&nbsp;
          {cd.days > 0 ? `${cd.days}d ` : ''}
          {pad(cd.hours)}:{pad(cd.minutes)}:{pad(cd.seconds)}
        </div>
      </div>

      {/* Right: CTA */}
      <Link
        href={`/auctions/${auctionId}#bid-panel`}
        className={`btn btn-primary ${styles.cta}`}
        scroll={false}
      >
        {isLive ? 'Bid Now' : 'Pre-Bid'}
      </Link>
    </div>
  );
}
