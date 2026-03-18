import { LotCard } from "@/components/auction/LotCard";

import styles from "./RecommendedLots.module.css";

type RecommendedLotsProps = {
  lots: Array<{
    id: string;
    title: string;
    currentBid: number;
    status: string;
    year: number;
    mileage: number;
    regionSpec: string | null;
    marketPrice: number | null;
    imageUrl?: string;
    startsAt: string | null;
    endsAt: string | null;
  }>;
};

function resolveEndTime(lot: RecommendedLotsProps["lots"][number]): string {
  const normalizedStatus = lot.status.trim().toUpperCase();

  if (normalizedStatus === "LIVE" || normalizedStatus === "EXTENDED") {
    return lot.endsAt ?? lot.startsAt ?? new Date().toISOString();
  }

  return lot.startsAt ?? lot.endsAt ?? new Date().toISOString();
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
          <LotCard
            key={lot.id}
            lotId={lot.id}
            title={lot.title}
            year={lot.year}
            mileage={lot.mileage}
            regionSpec={lot.regionSpec ?? undefined}
            imageUrl={lot.imageUrl || "/vehicle-photo.svg"}
            currentBid={lot.currentBid}
            status={lot.status}
            endTime={resolveEndTime(lot)}
            marketPrice={lot.marketPrice ?? undefined}
          />
        ))}
      </div>
    </section>
  );
}
