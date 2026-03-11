"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { IconArrowRight, IconCalendar, IconClock, IconPercent } from "@/components/ui/icons";
import { toIntlLocale, withLocalePath } from "@/src/i18n/routing";
import { AED_USD_PEG_RATE, formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";

import styles from "./LotCard.module.css";

type LotCardProps = {
  lotId: string;
  title: string;
  year: number;
  mileage: number;
  imageUrl: string;
  currentBid: number;
  status: string;
  endTime: string;
  marketPrice?: number;
  display?: DisplaySettings;
};

const DEFAULT_DISPLAY: DisplaySettings = {
  locale: "en",
  currency: "AED",
  usdPerAed: AED_USD_PEG_RATE,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function savingPct(market: number, current: number): number {
  if (!market || market <= current) {
    return 0;
  }

  return Math.round(((market - current) / market) * 100);
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function LiveCountdown({ endsAt }: { endsAt: string }) {
  const [cd, setCd] = useState(() => formatCountdown(new Date(endsAt).getTime() - Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      setCd(formatCountdown(new Date(endsAt).getTime() - Date.now()));
    }, 1000);

    return () => clearInterval(timer);
  }, [endsAt]);

  const urgent = cd.hours === 0 && cd.days === 0;

  return (
    <span className={urgent ? styles.urgent : styles.timeVal}>
      {cd.days > 0 ? `${cd.days}d ` : ""}
      {pad(cd.hours)}h {pad(cd.minutes)}m {pad(cd.seconds)}s
    </span>
  );
}

export function LotCard({
  lotId,
  title,
  year,
  mileage,
  imageUrl,
  currentBid,
  status,
  endTime,
  marketPrice,
  display = DEFAULT_DISPLAY,
}: LotCardProps) {
  const isLive = status === "LIVE";
  const isRu = display.locale === "ru";
  const intlLocale = toIntlLocale(display.locale);
  const saving = marketPrice ? savingPct(marketPrice, currentBid) : 0;

  return (
    <Link href={withLocalePath(`/auctions/${lotId}`, display.locale)} className={styles.card}>
      <div className={styles.imgWrap}>
        <Image
          src={imageUrl || "/vehicle-photo.svg"}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          style={{ objectFit: "cover", transition: "transform 0.4s" }}
        />
        <div className={styles.pillTl}>
          {isLive ? (
            <span className="pill pill-live">
              <span className="live-dot" />
              LIVE
            </span>
          ) : (
            <span className="pill pill-sched">{isRu ? "Скоро" : "Scheduled"}</span>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.meta}>
          {formatInteger(year, display.locale)} · {formatInteger(mileage, display.locale)} {isRu ? "км" : "KM"}
        </div>

        <div className={styles.strip}>
          <div className={`${styles.stripCell} ${styles.ours}`}>
            <div className={styles.stripLbl}>{isRu ? "Цена FleetBid" : "FleetBid price"}</div>
            <div className={styles.stripPrice}>{formatMoneyFromAed(currentBid, display)}</div>
            {saving > 0 && (
              <div className={styles.saving}>
                <IconPercent size={11} color="var(--green-600)" />
                {isRu ? `−${saving}% дешевле` : `−${saving}% cheaper`}
              </div>
            )}
          </div>
          {marketPrice ? (
            <>
              <div className={styles.divider} />
              <div className={styles.stripCell}>
                <div className={styles.stripLbl}>{isRu ? "Рыночная цена" : "Market price"}</div>
                <div className={styles.marketPrice}>{formatMoneyFromAed(marketPrice, display)}</div>
                <div className={styles.otherLbl}>{isRu ? "Другие площадки" : "Other listings"}</div>
              </div>
            </>
          ) : null}
        </div>

        <div className={styles.timing}>
          {isLive ? (
            <div className={styles.timingLeft}>
              <IconClock size={14} color="var(--ink-secondary)" />
              {isRu ? "До конца " : "Ends in "}
              <LiveCountdown endsAt={endTime} />
            </div>
          ) : (
            <div className={styles.timingLeft}>
              <IconCalendar size={14} color="var(--ink-secondary)" />
              {isRu ? "Старт " : "Opens "}
              {new Date(endTime).toLocaleDateString(intlLocale, {
                day: "numeric",
                month: "short",
              })}
            </div>
          )}
        </div>

        <div className={styles.buyBtn}>
          <div>
            <div className={styles.buyLabel}>{isLive ? (isRu ? "Купить сейчас от" : "Buy Now from") : isRu ? "Старт от" : "Starting from"}</div>
            <div className={styles.buyPrice}>{formatMoneyFromAed(currentBid, display)}</div>
          </div>
          <IconArrowRight size={18} color="#fff" />
        </div>
      </div>
    </Link>
  );
}
