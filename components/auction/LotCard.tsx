"use client";

import Image from "next/image";
import Link from "next/link";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import {
  IconArrowRight,
  IconCalendar,
  IconClock,
  IconHeart,
} from "@/components/ui/icons";
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
  buyNowPrice?: number | null;
  totalBids?: number;
  showVipEarlyAccessBadge?: boolean;
  display?: DisplaySettings;
  showWishlistControl?: boolean;
  defaultWatchlisted?: boolean;
  onWatchlistChange?: (watchlisted: boolean) => void;
};

const DEFAULT_DISPLAY: DisplaySettings = {
  locale: "en",
  currency: "AED",
  usdPerAed: AED_USD_PEG_RATE,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function trimYearFromTitle(title: string, year: number): string {
  const normalizedTitle = title.trim();

  if (year <= 0) {
    return normalizedTitle;
  }

  const suffix = ` ${year}`;

  if (!normalizedTitle.endsWith(suffix)) {
    return normalizedTitle;
  }

  return normalizedTitle.slice(0, -suffix.length).trim();
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
  buyNowPrice,
  showVipEarlyAccessBadge = false,
  display = DEFAULT_DISPLAY,
  showWishlistControl,
  defaultWatchlisted = false,
  onWatchlistChange,
}: LotCardProps) {
  const isLive = isLiveAuctionState(status);
  const isRu = display.locale === "ru";
  const intlLocale = toIntlLocale(display.locale);
  const hidePrice = isScheduledWithoutBids(status, currentBid);
  const visibleTitle = trimYearFromTitle(title, year);
  const hasBuyNowPrice = typeof buyNowPrice === "number" && buyNowPrice > 0;
  const showMarketFallback = typeof marketPrice === "number" && marketPrice > 0;
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [saved, setSaved] = useState(defaultWatchlisted);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setViewerRole(window.localStorage.getItem("fleetbid_role"));
  }, []);

  useEffect(() => {
    setSaved(defaultWatchlisted);
  }, [defaultWatchlisted]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function toggleWishlist(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const canToggleWishlist = showWishlistControl ?? viewerRole === "BUYER";

    if (!canToggleWishlist || wishlistBusy) {
      return;
    }

    const nextSaved = !saved;
    setSaved(nextSaved);
    onWatchlistChange?.(nextSaved);
    setWishlistBusy(true);

    try {
      await api.buyer.wishlist.toggle(lotId);
    } catch {
      if (isMountedRef.current) {
        setSaved(!nextSaved);
      }
      onWatchlistChange?.(!nextSaved);
    } finally {
      if (isMountedRef.current) {
        setWishlistBusy(false);
      }
    }
  }

  const shouldShowWishlistControl = showWishlistControl ?? viewerRole === "BUYER";

  return (
    <article className={styles.card}>
      {shouldShowWishlistControl ? (
        <div className={styles.actionButtons}>
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
        </div>
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
            <div className={styles.badgeStack}>
              {isLive ? (
                <span className="pill pill-live">
                  <span className="live-dot" />
                  LIVE
                </span>
              ) : (
                <span className="pill pill-sched">{isRu ? "Скоро" : "Scheduled"}</span>
              )}
              {showVipEarlyAccessBadge ? (
                <span className={styles.vipBadge}>{isRu ? "VIP ранний доступ" : "VIP early access"}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.title}>{visibleTitle}</div>
          <div className={styles.meta}>
            {year > 0 ? String(year) : "—"} · {formatInteger(mileage, display.locale)} {isRu ? "км" : "KM"}
            {regionSpec ? ` · ${regionSpec}` : ""}
          </div>

          <div className={styles.strip}>
            {hidePrice && (hasBuyNowPrice || showMarketFallback) ? (
              <div className={`${styles.stripCell} ${styles.fullWidthCell}`}>
                <div className={styles.stripLbl}>
                  {hasBuyNowPrice ? (isRu ? "Цена Buy Now" : "Buy Now price") : isRu ? "Рыночная цена" : "Market price"}
                </div>
                <div className={hasBuyNowPrice ? styles.buyNowStripPrice : styles.marketPrice}>
                  {formatMoneyFromAed(hasBuyNowPrice ? buyNowPrice : marketPrice!, display)}
                </div>
                {!hasBuyNowPrice && showMarketFallback ? (
                  <div className={styles.otherLbl}>{isRu ? "Другие площадки" : "Other listings"}</div>
                ) : null}
              </div>
            ) : (
              <>
                <div className={`${styles.stripCell} ${styles.ours}`}>
                  <div className={styles.stripLbl}>{isRu ? "Текущий pre-bid" : "Current pre-bid"}</div>
                  <div className={styles.stripPrice}>{hidePrice ? (isRu ? "Pre-Bid" : "Pre-Bid") : formatMoneyFromAed(currentBid, display)}</div>
                </div>
                {hasBuyNowPrice || showMarketFallback ? (
                  <>
                    <div className={styles.divider} />
                    <div className={styles.stripCell}>
                      <div className={styles.stripLbl}>
                        {hasBuyNowPrice ? (isRu ? "Цена Buy Now" : "Buy Now price") : isRu ? "Рыночная цена" : "Market price"}
                      </div>
                      <div className={hasBuyNowPrice ? styles.buyNowStripPrice : styles.marketPrice}>
                        {formatMoneyFromAed(hasBuyNowPrice ? buyNowPrice : marketPrice!, display)}
                      </div>
                      {!hasBuyNowPrice && showMarketFallback ? (
                        <div className={styles.otherLbl}>{isRu ? "Другие площадки" : "Other listings"}</div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </>
            )}
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
            <div aria-hidden="true">
              <IconArrowRight size={18} color="#fff" />
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
