import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { readHomepageLots } from "@/src/modules/ui/domain/marketplace_read_model";
import { AuctionLotCard } from "@/src/modules/ui/transport/components/public/auction_lot_card";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";
import styles from "./page.module.css";

const HERO_METRICS = [
  { value: "120+", label: "Active Lots" },
  { value: "6 March", label: "Next Auction" },
  { value: "25", label: "Verified Fleet Operators" },
] as const;

const HERO_FEATURES = [
  "Weekly live auction events",
  "5,000 AED refundable deposit",
  "Physical inspection in Dubai",
  "Export ready vehicles",
] as const;

export default async function HomePage() {
  const liveLots = (await readHomepageLots()).slice(0, 3);

  return (
    <MarketShell>
      <section className={`hero-surface ${styles.heroSurface}`}>
        <div className={styles.heroTop}>
          <div className={styles.heroTextSection}>
            <h1>Dubai Fleet Liquidation Auctions</h1>
            <p className={styles.heroSubtext}>
              Direct from Rent A Car operators. Maintained. On the road. Reduced price.
            </p>

            <ul className={styles.heroFeatureList}>
              {HERO_FEATURES.map((feature) => (
                <li key={feature} className={styles.heroFeatureItem}>
                  <CheckCircle2 size={22} aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className={`hero-actions ${styles.heroActions}`}>
              <Link href="/auctions" className="button button-primary">
                Browse Upcoming Auctions
              </Link>
              <Link href="/register" className="button button-secondary">
                Book Viewing
              </Link>
            </div>
          </div>

          <section className={styles.heroImageFrame} aria-hidden="true">
            <Image
              src="/hero-fleet-dubai.png"
              alt=""
              className={styles.heroImage}
              fill
              priority
              sizes="(max-width: 980px) 100vw, 56vw"
            />
          </section>
        </div>

        <section className={styles.heroStats} aria-label="Marketplace highlights">
          {HERO_METRICS.map((item) => (
            <div key={item.label} className={styles.heroMetricItem}>
              <p className={styles.heroMetricValue}>{item.value}</p>
              <p className={styles.heroMetricLabel}>{item.label}</p>
            </div>
          ))}
        </section>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>Upcoming Auctions</h2>
          <p>Preview upcoming lots before the weekly auction event.</p>
        </div>

        <div className="home-grid">
          {liveLots.map((lot) => (
            <AuctionLotCard key={lot.id} lot={lot} />
          ))}
        </div>
      </section>
    </MarketShell>
  );
}
