import Image from "next/image";
import Link from "next/link";

import type { SupportedLocale } from "@/src/i18n/routing";
import { withLocalePath } from "@/src/i18n/routing";
import { formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";
import type { Lot, PlatformStats } from "@/src/types/auction";

import HeroCountdown from "./HeroCountdown";
import styles from "./HeroSection.module.css";

interface Props {
  stats: PlatformStats;
  heroLot: Lot;
  display?: DisplaySettings;
}

const DEFAULT_DISPLAY: DisplaySettings = {
  locale: "en",
  currency: "AED",
  usdPerAed: 1 / 3.6725,
};

export default function HeroSection({ stats, heroLot, display = DEFAULT_DISPLAY }: Props) {
  const locale: SupportedLocale = display.locale;
  const isRu = locale === "ru";

  return (
    <section className={styles.hero}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.left}>
          <div className={styles.badge}>
            <span className="live-dot live-dot-green" />
            {isRu ? "Платформа ликвидации автопарков ОАЭ" : "UAE Fleet Liquidation Platform"}
          </div>

          <h1 className={styles.h1}>
            {isRu ? (
              <>
                Аукционы по продаже
                <br />
                автопарков Дубая
              </>
            ) : (
              <>
                Dubai Rent A Car
                <br />
                Liquidation Auctions
              </>
            )}
          </h1>

          <p className={styles.sub}>
            {isRu
              ? "Автомобили напрямую из действующих прокатных компаний ОАЭ. Обслужены. Готовы к дороге. Прозрачные условия."
              : "Direct fleet vehicles from active UAE rental companies. Maintained. Road-ready. Transparent."}
          </p>

          <p className={styles.trustLine}>
            {isRu ? "Не страховые списания. Не salvage. Без повреждённого стока." : "Not insurance. Not salvage. No damaged stock."}
          </p>

          <div className={styles.ctas}>
            <Link href={withLocalePath("/auctions", locale)} className="btn btn-primary btn-lg">
              {isRu ? "Смотреть ближайшие аукционы" : "Browse Upcoming Auctions"}
            </Link>
            <Link href="/how-it-works" className="btn btn-outline btn-lg">
              {isRu ? "Как это работает" : "How It Works"}
            </Link>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statVal}>{formatInteger(stats.lotsSold, locale)}+</div>
              <div className={styles.statLbl}>{isRu ? "Продано лотов" : "Lots Sold"}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{formatMoneyFromAed(stats.transactedAed, display)}</div>
              <div className={styles.statLbl}>{isRu ? "Объём сделок" : "Transacted"}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{formatInteger(stats.verifiedBuyers, locale)}+</div>
              <div className={styles.statLbl}>{isRu ? "Проверенных покупателей" : "Verified Buyers"}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{isRu ? `До −${stats.maxDiscountPct}%` : `Up to −${stats.maxDiscountPct}%`}</div>
              <div className={styles.statLbl}>{isRu ? "ниже рынка" : "vs. market price"}</div>
            </div>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.card}>
            <div className={styles.imgWrap}>
              <Image
                src={heroLot.imageUrl}
                alt={heroLot.title}
                fill
                sizes="(max-width: 768px) 100vw, 560px"
                style={{ objectFit: "cover" }}
                priority
              />
              <div className={styles.pillTl}>
                <span className="pill pill-live">
                  <span className="live-dot" />
                  LIVE
                </span>
              </div>
              <div className={styles.bidFloat}>
                <div className={styles.bidLbl}>{isRu ? "Текущая ставка" : "Current bid"}</div>
                <div className={styles.bidVal}>{formatMoneyFromAed(heroLot.currentBidAed, display)}</div>
              </div>
            </div>

            <HeroCountdown endsAt={heroLot.endsAt} locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}
