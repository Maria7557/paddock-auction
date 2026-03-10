import Link from 'next/link';
import type { Lot } from '@/src/types/auction';
import { LotCard } from '@/components/auction/LotCard';
import styles from './LotsSection.module.css';

interface Props { lots: Lot[]; totalCount: number; }

export default function LotsSection({ lots, totalCount }: Props) {
  return (
    <section className={styles.section}>
      <div className="container">

        <div className={styles.header}>
          <div>
            <div className="eyebrow eyebrow-green">This Week's Inventory</div>
            <h2 className="section-h2">Upcoming Auctions</h2>
            <p className={styles.sub}>
              Save up to <strong className={styles.highlight}>50% below market price</strong>
              {' '}— the same cars listed elsewhere cost significantly more.
            </p>
          </div>
          <Link href="/auctions" className="btn btn-outline btn-sm">
            View All {totalCount} Lots
          </Link>
        </div>

        <div className={styles.grid}>
          {lots.map((lot) => (
            <LotCard
              key={lot.id}
              lotId={lot.id}
              title={lot.title}
              year={lot.year}
              mileage={lot.mileageKm}
              imageUrl={lot.imageUrl}
              currentBid={lot.currentBidAed}
              status={lot.status}
              endTime={lot.endsAt}
            />
          ))}
        </div>

        <div className={styles.more}>
          <Link href="/auctions" className="btn btn-outline">
            See All {totalCount} Lots This Week
          </Link>
        </div>
      </div>
    </section>
  );
}
