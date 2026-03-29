import Link from "next/link";

import { isLiveAuctionState } from "@/src/lib/auction-display";
import { withLocalePath } from "@/src/i18n/routing";
import { type DisplaySettings } from "@/src/lib/money";
import type { AuctionLot } from "@/src/modules/ui/domain/marketplace_read_model";

import { LotCard } from "@/components/auction/LotCard";

import styles from "./LotsSection.module.css";

interface Props {
  lots: AuctionLot[];
  totalCount: number;
  display?: DisplaySettings;
}

const DEFAULT_DISPLAY: DisplaySettings = {
  locale: "en",
  currency: "AED",
  usdPerAed: 1 / 3.6725,
};

function getRegionSpec(lot: AuctionLot): string | undefined {
  return lot.specs.find((spec) => spec.label.toLowerCase() === "region")?.value ?? undefined;
}

export default function LotsSection({ lots, totalCount, display = DEFAULT_DISPLAY }: Props) {
  const isRu = display.locale === "ru";
  const hasLots = lots.length > 0;

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
          {hasLots ? (
            <Link href={withLocalePath("/auctions", display.locale)} className="btn btn-outline btn-sm">
              {isRu ? `Все лоты (${totalCount})` : `View All ${totalCount} Lots`}
            </Link>
          ) : null}
        </div>

        {hasLots ? (
          <div className={styles.grid}>
            {lots.map((lot) => (
              <LotCard
                key={lot.id}
                lotId={lot.id}
                title={lot.title}
                year={lot.year}
                mileage={lot.mileageKm}
                regionSpec={getRegionSpec(lot)}
                imageUrl={lot.images[0] ?? "/vehicle-photo.svg"}
                currentBid={lot.currentBidAed}
                buyNowPrice={lot.buyNowPriceAed ?? undefined}
                status={lot.status}
                endTime={
                  isLiveAuctionState(lot.status)
                    ? lot.endsAt ?? lot.startsAt ?? new Date().toISOString()
                    : lot.startsAt ?? lot.endsAt ?? new Date().toISOString()
                }
                display={display}
                showWishlistControl
              />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>
              {isRu ? "Пока нет активных лотов для главной страницы" : "There are no active homepage lots yet"}
            </div>
            <p className={styles.emptyText}>
              {isRu
                ? "Когда в базе появятся LIVE или SCHEDULED аукционы, карточки автоматически подтянутся сюда без ручных подстановок и фиктивных цен."
                : "As soon as LIVE or SCHEDULED auctions exist in the database, they will appear here automatically without manual placeholders or synthetic pricing."}
            </p>
          </div>
        )}

        {hasLots ? (
          <div className={styles.more}>
            <Link href={withLocalePath("/auctions", display.locale)} className="btn btn-outline">
              {isRu ? `Смотреть все ${totalCount} лотов` : `See All ${totalCount} Lots This Week`}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
