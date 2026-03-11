import Link from "next/link";

import { withLocalePath } from "@/src/i18n/routing";
import { type DisplaySettings } from "@/src/lib/money";
import type { Lot } from "@/src/types/auction";

import { LotCard } from "@/components/auction/LotCard";

import styles from "./LotsSection.module.css";

interface Props {
  lots: Lot[];
  totalCount: number;
  display?: DisplaySettings;
}

const DEFAULT_DISPLAY: DisplaySettings = {
  locale: "en",
  currency: "AED",
  usdPerAed: 1 / 3.6725,
};

export default function LotsSection({ lots, totalCount, display = DEFAULT_DISPLAY }: Props) {
  const isRu = display.locale === "ru";

  return (
    <section className={styles.section}>
      <div className="container">
        <div className={styles.header}>
          <div>
            <div className="eyebrow eyebrow-green">{isRu ? "Инвентарь этой недели" : "This Week's Inventory"}</div>
            <h2 className="section-h2">{isRu ? "Ближайшие аукционы" : "Upcoming Auctions"}</h2>
            <p className={styles.sub}>
              {isRu ? (
                <>
                  Экономьте до <strong className={styles.highlight}>50% ниже рынка</strong> — те же автомобили на открытом рынке стоят заметно дороже.
                </>
              ) : (
                <>
                  Save up to <strong className={styles.highlight}>50% below market price</strong> — the same cars listed elsewhere cost significantly more.
                </>
              )}
            </p>
          </div>
          <Link href={withLocalePath("/auctions", display.locale)} className="btn btn-outline btn-sm">
            {isRu ? `Все лоты (${totalCount})` : `View All ${totalCount} Lots`}
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
              marketPrice={lot.marketPriceAed}
              status={lot.status}
              endTime={lot.endsAt}
              display={display}
            />
          ))}
        </div>

        <div className={styles.more}>
          <Link href={withLocalePath("/auctions", display.locale)} className="btn btn-outline">
            {isRu ? `Смотреть все ${totalCount} лотов` : `See All ${totalCount} Lots This Week`}
          </Link>
        </div>
      </div>
    </section>
  );
}
