import Image from 'next/image';
import Link from 'next/link';
import type { PlatformStats, Lot } from '@/src/types/auction';
import { formatAed } from '@/src/lib/utils';
import HeroCountdown from './HeroCountdown';
import styles from './HeroSection.module.css';

interface Props {
  stats: PlatformStats;
  heroLot: Lot;
}

export default function HeroSection({ stats, heroLot }: Props) {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.grid}`}>

        {/* Left — copy */}
        <div className={styles.left}>
          <div className={styles.badge}>
            <span className="live-dot live-dot-green" />
            UAE Fleet Liquidation Platform
          </div>

          <h1 className={styles.h1}>
            Dubai Rent A Car<br />Liquidation Auctions
          </h1>

          <p className={styles.sub}>
            Direct fleet vehicles from active UAE rental companies.
            Maintained. Road-ready. Transparent.
          </p>

          <p className={styles.trustLine}>
            Not insurance. Not salvage. No damaged stock.
          </p>

          <div className={styles.ctas}>
            <Link href="/auctions" className="btn btn-primary btn-lg">
              Browse Upcoming Auctions
            </Link>
            <Link href="/how-it-works" className="btn btn-outline btn-lg">
              How It Works
            </Link>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statVal}>{stats.lotsSold.toLocaleString()}+</div>
              <div className={styles.statLbl}>Lots Sold</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>AED 1.2B</div>
              <div className={styles.statLbl}>Transacted</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{stats.verifiedBuyers}+</div>
              <div className={styles.statLbl}>Verified Buyers</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>Up to −{stats.maxDiscountPct}%</div>
              <div className={styles.statLbl}>vs. market price</div>
            </div>
          </div>
        </div>

        {/* Right — hero lot card */}
        <div className={styles.right}>
          <div className={styles.card}>
            <div className={styles.imgWrap}>
              <Image
                src={heroLot.imageUrl}
                alt={heroLot.title}
                fill
                sizes="(max-width: 768px) 100vw, 560px"
                style={{ objectFit: 'cover' }}
                priority
              />
              <div className={styles.pillTl}>
                <span className="pill pill-live">
                  <span className="live-dot" />
                  LIVE
                </span>
              </div>
              <div className={styles.bidFloat}>
                <div className={styles.bidLbl}>Current bid</div>
                <div className={styles.bidVal}>{formatAed(heroLot.currentBidAed)}</div>
              </div>
            </div>

            {/* Live countdown driven by client component */}
            <HeroCountdown endsAt={heroLot.endsAt} />
          </div>
        </div>

      </div>
    </section>
  );
}
