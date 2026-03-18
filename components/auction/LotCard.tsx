"use client";

import Image from "next/image";
import Link from "next/link";
import { type MouseEvent, useEffect, useState } from "react";

import { IconArrowRight, IconCalendar, IconClock, IconHeart } from "@/components/ui/icons";
import { api } from "@/src/lib/api-client";
import { isLiveAuctionState, isScheduledWithoutBids } from "@/src/lib/auction-display";
import { toIntlLocale, withLocalePath } from "@/src/i18n/routing";
import { AED_USD_PEG_RATE, formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";

import styles from "./LotCard.module.css";

type LotCardProps = {
  lotId: string;
  title: string;
  year: number;
  mileage: number;
  regionSpec?: string;
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

function formatOpeningLabel(value: string, intlLocale: string): string {
  const openingDate = new Date(value);
  const dateLabel = openingDate.toLocaleDateString(intlLocale, {
    day: "numeric",
    month: "short",
  });
  const timeLabel = openingDate.toLocaleTimeString(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${dateLabel} ${timeLabel}`;
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
  regionSpec,
  imageUrl,
  currentBid,
  status,
  endTime,
  marketPrice,
  display = DEFAULT_DISPLAY,
}: LotCardProps) {
  const isLive = isLiveAuctionState(status);
  const isRu = display.locale === "ru";
  const intlLocale = toIntlLocale(display.locale);
  const saving = marketPrice ? savingPct(marketPrice, currentBid) : 0;
  const hidePrice = isScheduledWithoutBids(status, currentBid);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setViewerRole(window.localStorage.getItem("fleetbid_role"));
  }, []);

  async function toggleWishlist(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (viewerRole !== "BUYER" || wishlistBusy) {
      return;
    }

    const nextSaved = !saved;
    setSaved(nextSaved);
    setWishlistBusy(true);

    try {
      if (nextSaved) {
        await api.buyer.wishlist.add(lotId);
      } else {
        await api.buyer.wishlist.remove(lotId);
      }
    } catch {
      setSaved(!nextSaved);
    } finally {
      setWishlistBusy(false);
    }
  }

  return (
    <article className={styles.card}>
      {viewerRole === "BUYER" ? (
        <button
          type="button"
          className={`${styles.wishlistBtn} ${saved ? styles.wishlistActive : ""}`}
          onClick={(event) => void toggleWishlist(event)}
          disabled={wishlistBusy}
          aria-label={saved ? (isRu ? "Убрать из избранного" : "Remove from watchlist") : isRu ? "Добавить в избранное" : "Add to watchlist"}
          aria-pressed={saved}
        >
          <IconHeart size={18} />
        </button>
      ) : null}

      <Link href={withLocalePath(`/auctions/${lotId}`, display.locale)} className={styles.cardLink}>
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
            {year > 0 ? String(year) : "—"} · {formatInteger(mileage, display.locale)} {isRu ? "км" : "KM"}
            {regionSpec ? ` · ${regionSpec}` : ""}
          </div>

          <div className={styles.strip}>
            <div className={`${styles.stripCell} ${styles.ours}`}>
              <div className={styles.stripLbl}>
                {hidePrice ? (isRu ? "Сделайте первый pre-bid" : "Place the first pre-bid") : isRu ? "Цена FleetBid" : "FleetBid price"}
              </div>
              <div className={styles.stripPrice}>
                {hidePrice ? (isRu ? "Pre-Bid" : "Pre-Bid") : formatMoneyFromAed(currentBid, display)}
              </div>
              {!hidePrice && saving > 0 && (
                <div className={styles.saving}>{isRu ? `На ${saving}% дешевле` : `${saving}% cheaper`}</div>
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
                {formatOpeningLabel(endTime, intlLocale)}
              </div>
            )}
          </div>

          <div className={styles.buyBtn}>
            <div>
              <div className={styles.buyLabel}>
                {hidePrice
                  ? isRu
                    ? "Будьте первым в pre-bid"
                    : "Be the first to pre-bid"
                  : isLive
                    ? isRu
                      ? "Купить сейчас от"
                      : "Buy Now from"
                    : isRu
                      ? "Текущая pre-bid"
                      : "Current pre-bid"}
              </div>
              <div className={styles.buyPrice}>
                {hidePrice ? (isRu ? "Открыть pre-bid" : "Open pre-bid") : formatMoneyFromAed(currentBid, display)}
              </div>
            </div>
            <IconArrowRight size={18} color="#fff" />
          </div>
        </div>
      </Link>
    </article>
  );
}
