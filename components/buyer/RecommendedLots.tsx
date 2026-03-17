import Image from "next/image";
import Link from "next/link";

import { IconCar } from "@/components/ui/icons";
import { formatAed } from "@/src/lib/utils";

import styles from "./RecommendedLots.module.css";

type RecommendedLotsProps = {
  lots: Array<{
    id: string;
    title: string;
    currentBid: number;
    status: string;
    imageUrl?: string;
  }>;
};

function resolveStatusClass(status: string): string {
  const normalizedStatus = status.trim().toUpperCase();

  if (normalizedStatus === "LIVE") {
    return styles.badgeLive;
  }

  return styles.badgeScheduled;
}

export function RecommendedLots({ lots }: RecommendedLotsProps) {
  if (lots.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>Start here — active auctions</h2>
      </div>

      <div className={styles.grid}>
        {lots.map((lot) => (
          <Link key={lot.id} href={`/auctions/${lot.id}`} className={styles.card}>
            <div className={styles.imageWrap}>
              {lot.imageUrl ? (
                <Image
                  src={lot.imageUrl}
                  alt={lot.title}
                  fill
                  sizes="(max-width: 980px) 100vw, 280px"
                  className={styles.image}
                />
              ) : (
                <div className={styles.placeholder}>
                  <IconCar size={26} aria-hidden="true" />
                </div>
              )}
              <span className={`${styles.badge} ${resolveStatusClass(lot.status)}`}>
                {lot.status.trim().toUpperCase() === "LIVE" ? "LIVE" : "Scheduled"}
              </span>
            </div>

            <div className={styles.body}>
              <strong>{lot.title}</strong>
              <span>{formatAed(lot.currentBid)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
