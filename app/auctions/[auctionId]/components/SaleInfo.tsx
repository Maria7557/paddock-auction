// app/lot/[id]/components/SaleInfo.tsx

import type { LotDetail } from '../page';
import { formatAed } from '@/src/lib/utils';
import styles from './Sections.module.css';

type Props = { lot: LotDetail };

export function SaleInfo({ lot }: Props) {
  const date = new Date(lot.auctionAt);
  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const referencePrice = lot.currentBidAed > 0 ? lot.currentBidAed : 0;
  const showACV =
    !!lot.actualCashValue &&
    lot.actualCashValue > 0 &&
    referencePrice > 0 &&
    lot.actualCashValue < referencePrice * 5;

  const cells: { label: string; value: React.ReactNode | null; accent?: boolean }[] = [
    {
      label: 'Selling Company',
      value: `${lot.sellerName}${lot.sellerRef ? ' ' + lot.sellerRef : ''}`,
    },
    {
      label: 'Vehicle Location',
      value: lot.location,
    },
    {
      label: 'Auction Date & Time',
      value: (
        <span>
          {dateStr}
          <br />
          <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>{timeStr} GST</span>
        </span>
      ),
    },
    {
      label: 'Actual Cash Value',
      value: showACV ? formatAed(lot.actualCashValue) : null,
      accent: true,
    },
  ].filter((cell) => cell.value !== null);

  return (
    <section className={styles.card} aria-labelledby="si-heading">
      <h2 id="si-heading" className={styles.cardTitle}>Sale Information</h2>
      <div className={styles.infoGrid}>
        {cells.map((c) => (
          <div key={c.label} className={styles.infoCell}>
            <div className={styles.infoLabel}>{c.label}</div>
            <div className={`${styles.infoValue} ${c.accent ? styles.infoAccent : ''}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
