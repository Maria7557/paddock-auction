import Image from "next/image";
import Link from "next/link";

import { withLocalePath } from "@/src/i18n/routing";
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
              </div>
              <div className={styles.body}>
                <div className={styles.lotTitle}>{lot.title}</div>
                <div className={styles.lotMeta}>
                  {formatInteger(lot.year, display.locale)} · {formatInteger(lot.mileageKm, display.locale)} {isRu ? "км" : "km"}
                </div>
                <div className={styles.lotPrice}>{formatMoneyFromAed(lot.currentBidAed, display)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
