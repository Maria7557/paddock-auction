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
import { formatAed } from "@/src/lib/utils";

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
  const lotHref = withLocalePath(`/auctions/${lotId}`, display.locale);
  const buyNowValue = typeof buyNowPrice === "number" && buyNowPrice > 0 ? buyNowPrice : null;
  const marketFallbackValue = typeof marketPrice === "number" && marketPrice > 0 ? marketPrice : null;
  const hasBuyNowPrice = buyNowValue !== null;
  const showMarketFallback = marketFallbackValue !== null;
  const mileageValue = mileage > 0 ? `${formatInteger(mileage, display.locale)} KM` : "—";
  const yearValue = year > 0 ? String(year) : "—";
  const regionSpecValue = regionSpec?.trim() ? regionSpec.trim() : "—";
  const mobileMetaParts = [
    year > 0 ? String(year) : null,
    mileage > 0 ? `${formatInteger(mileage, display.locale)} KM` : null,
    regionSpec?.trim() ? regionSpec.trim() : null,
  ].filter((value): value is string => value !== null);
  const mobileMeta = mobileMetaParts.length > 0 ? mobileMetaParts.join(" · ") : "—";
  const buyNowLabel = buyNowValue !== null ? formatAed(buyNowValue) : null;
  const mobileDetailsId = `lot-card-mobile-details-${lotId}`;
  const mobileDetails = [
    { label: "Primary damage", value: "—" },
    { label: "Secondary damage", value: "—" },
    { label: "Mileage", value: mileageValue },
    { label: "Year", value: yearValue },
    { label: "Region spec", value: regionSpecValue },
    { label: "Title", value: visibleTitle || "—" },
    { label: "Keys", value: "—" },
    { label: "Condition", value: "—" },
    { label: "Engine", value: "—" },
    { label: "Fuel", value: "—" },
    { label: "Drive", value: "—" },
    { label: "Transmission", value: "—" },
  ];
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [saved, setSaved] = useState(defaultWatchlisted);
  const [expanded, setExpanded] = useState(false);
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
  const wishlistLabel = saved ? (isRu ? "Убрать из избранного" : "Remove from watchlist") : isRu ? "Добавить в избранное" : "Add to watchlist";

  function toggleExpanded(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setExpanded((current) => !current);
  }

  return (
    <article className={styles.card}>
      {shouldShowWishlistControl ? (
        <div className={styles.actionButtons}>
          <button
            type="button"
            className={`${styles.wishlistBtn} ${saved ? styles.wishlistActive : ""}`}
            onClick={(event) => void toggleWishlist(event)}
            disabled={wishlistBusy}
            aria-label={wishlistLabel}
            aria-pressed={saved}
          >
            <IconHeart size={18} />
          </button>
        </div>
      ) : null}

      <Link href={lotHref} className={styles.cardLink}>
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
                  {formatMoneyFromAed(hasBuyNowPrice ? buyNowValue! : marketFallbackValue!, display)}
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
                        {formatMoneyFromAed(hasBuyNowPrice ? buyNowValue! : marketFallbackValue!, display)}
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

      <div className={styles.mobCard}>
        <div className={styles.mobRow}>
          <Link href={lotHref} className={styles.mobThumbLink} aria-label={title}>
            <div className={styles.mobThumb}>
              <Image
                src={imageUrl || "/vehicle-photo.svg"}
                alt={title}
                fill
                sizes="(max-width: 740px) 132px, 0px"
                className={styles.mobThumbImage}
              />
            </div>
          </Link>

          <div className={styles.mobSummary}>
            <Link href={lotHref} className={styles.mobSummaryLink}>
              <div className={styles.mobTitle}>{visibleTitle}</div>
              <div className={styles.mobMeta}>{mobileMeta}</div>
              <div className={styles.mobTiming}>
                {isLive ? (
                  <>
                    <IconClock size={13} color="var(--ink-muted)" />
                    <span>{isRu ? "До конца" : "Ends in"}</span>
                    <LiveCountdown endsAt={endTime} />
                  </>
                ) : (
                  <>
                    <IconCalendar size={13} color="var(--ink-muted)" />
                    <span>{isRu ? "Старт" : "Opens"}</span>
                    <span className={styles.mobTimingValue}>{formatOpeningLabel(endTime, intlLocale)}</span>
                  </>
                )}
              </div>
            </Link>
          </div>

          <div className={styles.mobActions}>
            {shouldShowWishlistControl ? (
              <button
                type="button"
                className={`${styles.wishlistBtn} ${styles.mobWishlistBtn} ${saved ? styles.wishlistActive : ""}`}
                onClick={(event) => void toggleWishlist(event)}
                disabled={wishlistBusy}
                aria-label={wishlistLabel}
                aria-pressed={saved}
              >
                <IconHeart size={16} />
              </button>
            ) : null}

            <Link href={lotHref} className={styles.mobPreBid}>
              Pre-Bid
            </Link>

            {buyNowLabel ? (
              <Link href={lotHref} className={styles.mobBuyNowLink}>
                Buy Now — {buyNowLabel}
              </Link>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className={styles.mobToggle}
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-controls={mobileDetailsId}
        >
          <span>{expanded ? "View less" : "View details"}</span>
          <span aria-hidden="true" className={styles.mobToggleIcon}>
            {expanded ? "▴" : "▾"}
          </span>
        </button>

        {expanded ? (
          <div id={mobileDetailsId} className={styles.mobExpanded}>
            <Link href={lotHref} className={styles.mobExpandedLink} aria-label={title}>
              <div className={styles.mobExpandedPhoto}>
                <Image
                  src={imageUrl || "/vehicle-photo.svg"}
                  alt={title}
                  fill
                  sizes="(max-width: 740px) 100vw, 0px"
                  className={styles.mobExpandedImage}
                />
              </div>
            </Link>

            <div className={styles.mobDetailsGrid}>
              {mobileDetails.map((detail) => (
                <div key={detail.label} className={styles.mobDetailRow}>
                  <div className={styles.mobDetailLabel}>{detail.label}:</div>
                  <div className={styles.mobDetailValue}>{detail.value}</div>
                </div>
              ))}
            </div>

            <Link href={lotHref} className={styles.mobExpandedCta}>
              {buyNowLabel ? `Buy Now — ${buyNowLabel}` : "Pre-Bid"}
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}
