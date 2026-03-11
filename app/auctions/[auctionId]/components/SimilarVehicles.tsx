// app/lot/[id]/components/SimilarVehicles.tsx

import Link from 'next/link';
import Image from 'next/image';
import { formatAed } from '@/src/lib/utils';
import styles from './SimilarVehicles.module.css';

type SimilarLot = {
  id:           string;
  auctionId:    string;
  title:        string;
  year:         number;
  mileageKm:    number;
  currentBidAed: number;
  state:        string;
  imageUrl:     string;
};

export function SimilarVehicles({ lots }: { lots: SimilarLot[] }) {
  return (
    <section className={styles.section} aria-labelledby="sv-heading">
      <div className={styles.header}>
        <h2 id="sv-heading" className={styles.title}>Similar Vehicles</h2>
        <Link href="/auctions" className={styles.seeAll}>
          Browse All Lots →
        </Link>
      </div>

      <div className={styles.grid}>
        {lots.map((lot) => {
          const isLive = lot.state === 'LIVE' || lot.state === 'EXTENDED';
          return (
            <Link key={lot.id} href={`/auctions/${lot.id}`} className={styles.card}>
              <div className={styles.imgWrap}>
                <Image
                  src={lot.imageUrl}
                  alt={lot.title}
                  fill
                  sizes="(max-width: 740px) 100vw, 300px"
                  style={{ objectFit: 'cover' }}
                />
                <div className={styles.badge} data-live={isLive}>
                  {isLive ? (
                    <><span className={styles.dot} aria-hidden /> LIVE</>
                  ) : (
                    'Upcoming'
                  )}
                </div>
              </div>
              <div className={styles.body}>
                <div className={styles.lotTitle}>{lot.title}</div>
                <div className={styles.lotMeta}>
                  {lot.year} · {lot.mileageKm.toLocaleString()} km
                </div>
                <div className={styles.lotPrice}>{formatAed(lot.currentBidAed)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
