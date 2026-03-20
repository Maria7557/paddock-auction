import Image from "next/image";
import Link from "next/link";

import { withLocalePath } from "@/src/i18n/routing";
import { isScheduledWithoutBids } from "@/src/lib/auction-display";
import { formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";

import styles from "./SimilarVehicles.module.css";

type SimilarLot = {
  id: string;
  auctionId: string;
  title: string;
  year: number;
  mileageKm: number;
  currentBidAed: number;
  state: string;
  imageUrl: string;
  showVipEarlyAccessBadge?: boolean;
};

export function SimilarVehicles({ lots, display }: { lots: SimilarLot[]; display: DisplaySettings }) {
  const isRu = display.locale === "ru";

  return (
    <section className={styles.section} aria-labelledby="sv-heading">
      <div className={styles.header}>
        <h2 id="sv-heading" className={styles.title}>
          {isRu ? "Похожие автомобили" : "Similar Vehicles"}
        </h2>
        <Link href={withLocalePath("/auctions", display.locale)} className={styles.seeAll}>
          {isRu ? "Смотреть все лоты" : "Browse All Lots"}
        </Link>
      </div>

      <div className={styles.grid}>
        {lots.map((lot) => {
          const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
          const hidePrice = isScheduledWithoutBids(lot.state, lot.currentBidAed);

          return (
            <Link key={lot.id} href={withLocalePath(`/auctions/${lot.id}`, display.locale)} className={styles.card}>
              <div className={styles.imgWrap}>
                <Image
                  src={lot.imageUrl}
                  alt={lot.title}
                  fill
                  sizes="(max-width: 740px) 100vw, 300px"
                  style={{ objectFit: "cover" }}
                />
                <div className={styles.badgeStack}>
                  <div className={styles.badge} data-live={isLive}>
                    {isLive ? (
                      <>
                        <span className={styles.dot} aria-hidden /> LIVE
                      </>
                    ) : isRu ? (
                      "Скоро"
                    ) : (
                      "Upcoming"
                    )}
                  </div>
                  {lot.showVipEarlyAccessBadge ? (
                    <div className={styles.vipBadge}>
                      <svg className={styles.vipBadgeIcon} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M10 1.5l2.63 5.33 5.88.86-4.26 4.15 1 5.86L10 15l-5.25 2.7 1-5.86L1.5 7.69l5.88-.86L10 1.5z" />
                      </svg>
                      <span>{isRu ? "24ч ранний доступ" : "24h Early Access"}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={styles.body}>
                <div className={styles.lotTitle}>{lot.title}</div>
                <div className={styles.lotMeta}>
                  {String(lot.year)} · {formatInteger(lot.mileageKm, display.locale)} {isRu ? "км" : "km"}
                </div>
                <div className={styles.lotPrice}>
                  {hidePrice ? (isRu ? "Pre-Bid" : "Pre-Bid") : formatMoneyFromAed(lot.currentBidAed, display)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
