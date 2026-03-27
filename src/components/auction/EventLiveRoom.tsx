"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";
import type { LotDetail } from "@/app/auctions/[auctionId]/page";
import { IconCar, IconClock, IconEye, IconTag, IconUsers, IconZap } from "@/components/ui/icons";
import { useEventLiveSocket } from "@/src/hooks/useEventLiveSocket";
import { getLocaleFromPathname, withLocalePath } from "@/src/i18n/routing";
import { type UiAuctionBidHistoryEntry, api, getApiErrorMessage } from "@/src/lib/api-client";
import {
  type EventLotView,
  mapAuctionPayloadToEventLotView,
  mapServerLotToEventLotView,
} from "@/src/lib/event-live-lot";
import { formatAed } from "@/src/lib/utils";
import type { EventRuntime } from "@/src/types/auction";

import styles from "./AuctionLiveRoom.module.css";

const NORMAL_FUSE_DURATION_MS = 20_000;
const LAST_CHANCE_FUSE_DURATION_MS = 10_000;
const FUSE_TICK_INTERVAL_MS = 50;
const PLACEHOLDER_PHOTOS = [
  { id: "placeholder-1", label: "Front 3/4", bg: "linear-gradient(135deg,#e8edf2 0%,#cdd5df 100%)" },
  { id: "placeholder-2", label: "Rear 3/4", bg: "linear-gradient(135deg,#dde3ea 0%,#bec8d4 100%)" },
  { id: "placeholder-3", label: "Interior", bg: "linear-gradient(135deg,#ede9e3 0%,#d4cdc4 100%)" },
  { id: "placeholder-4", label: "Dashboard", bg: "linear-gradient(135deg,#e3e8ed 0%,#c8d0d9 100%)" },
] as const;
const API_MEDIA_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ?? "";

type Props = {
  eventId: string;
  initialRuntime: EventRuntime;
  initialLot: EventLotView | null;
};

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type GalleryPhoto = {
  id: string;
  label: string;
  url: string | null;
  bg: string;
};
type SpecRow = {
  label: string;
  value: string;
  green?: boolean;
  mono?: boolean;
};
type BidFeedEntry = {
  id: string;
  amount: number;
  timestamp: number;
  isLeader: boolean;
  isMine: boolean;
  initials: string;
  locationLabel: string;
  flag: string;
};

function formatSessionId(eventId: string): string {
  return `EVT-${eventId.slice(0, 8).toUpperCase()}`;
}

function formatLotNumber(lotNumber: string): string {
  const digits = String(lotNumber).replace(/\D/g, "");

  if (digits.length > 0) {
    return digits.slice(-3).padStart(3, "0");
  }

  return String(lotNumber).toUpperCase();
}

function timeAgo(timestamp: number): string {
  const diffSeconds = Math.floor((Date.now() - timestamp) / 1_000);

  if (diffSeconds < 5) {
    return "just now";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  return `${Math.floor(diffSeconds / 60)}m ago`;
}

function getConnectionClassName(state: ConnectionState): string {
  switch (state) {
    case "connected":
      return styles.connectionConnected;
    case "error":
      return styles.connectionError;
    case "disconnected":
      return styles.connectionDisconnected;
    default:
      return styles.connectionConnecting;
  }
}

function getStatusLabel(state: EventRuntime["state"]): string {
  switch (state) {
    case "LIVE":
      return "LIVE";
    case "CLOSED":
      return "CLOSED";
    default:
      return "UP NEXT";
  }
}

function getStatusClassName(state: EventRuntime["state"]): string {
  switch (state) {
    case "CLOSED":
      return styles.livePillMuted;
    case "SCHEDULED":
      return styles.livePillScheduled;
    default:
      return "";
  }
}

function normalizeGalleryUrl(url: string): string {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return trimmedUrl;
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("/uploads/") && API_MEDIA_BASE_URL) {
    return `${API_MEDIA_BASE_URL}${trimmedUrl}`;
  }

  if (trimmedUrl.startsWith("/")) {
    return trimmedUrl;
  }

  return `/${trimmedUrl}`;
}

function buildGalleryPhotos(lot: EventLotView | null): GalleryPhoto[] {
  if (!lot || lot.images.length === 0) {
    return PLACEHOLDER_PHOTOS.map((photo) => ({
      ...photo,
      url: null,
    }));
  }

  return lot.images.map((image, index) => ({
    id: `image-${index + 1}`,
    label: PLACEHOLDER_PHOTOS[index % PLACEHOLDER_PHOTOS.length].label,
    url: normalizeGalleryUrl(image),
    bg: PLACEHOLDER_PHOTOS[index % PLACEHOLDER_PHOTOS.length].bg,
  }));
}

function buildSpecRows(lot: EventLotView | null): SpecRow[] {
  if (!lot) {
    return [];
  }

  return [
    { label: "Year", value: String(lot.year || "—") },
    { label: "Mileage", value: lot.mileageKm > 0 ? `${lot.mileageKm.toLocaleString("en-AE")} km` : "—" },
    { label: "Region Spec", value: lot.regionSpec || "—" },
    { label: "Condition", value: lot.condition || "—", green: true },
    { label: "Transmission", value: lot.transmission || "—" },
    { label: "Fuel", value: lot.fuelType || "—" },
    { label: "Body", value: lot.bodyStyle || "—" },
    { label: "Drive", value: lot.driveType || "—" },
    { label: "Exterior", value: lot.color || "—" },
    { label: "Interior", value: lot.colorInterior || "—" },
    { label: "Engine", value: lot.engine || "—" },
    { label: "Airbags", value: lot.airbags || "—" },
    { label: "Damage", value: lot.damage || "—" },
    { label: "Seller", value: lot.sellerName || "—" },
    { label: "Location", value: lot.location || "—" },
    { label: "VIN", value: lot.vin ? lot.vin.slice(-8) : "—", mono: true },
  ];
}

function formatCountdownParts(ms: number): { hours: string; minutes: string; seconds: string } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function formatScheduledAt(value: string, locale: "en" | "ru"): string {
  const date = new Date(value);
  const intlLocale = locale === "ru" ? "ru-RU" : "en-AE";

  return new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function mapBidFeed(entries: UiAuctionBidHistoryEntry[]): BidFeedEntry[] {
  return entries.map((entry, index) => ({
    id: entry.id,
    amount: entry.amount_aed,
    timestamp: Date.parse(entry.placed_at),
    isLeader: index === 0,
    isMine: entry.is_mine,
    initials: entry.company_initials?.trim() || "MK",
    locationLabel: entry.location_label?.trim() || entry.company_name?.trim() || "Market",
    flag: entry.flag?.trim() || "",
  }));
}

function Gallery({ lotKey, photos, title }: { lotKey: string; photos: GalleryPhoto[]; title: string }) {
  const [active, setActive] = useState(0);
  const [failedPhotoIds, setFailedPhotoIds] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setActive(0);
    setFailedPhotoIds([]);
    setIsExpanded(false);
  }, [lotKey]);

  const activePhoto = photos[active] ?? photos[0];

  if (!activePhoto) {
    return null;
  }

  const isBroken = (photo: GalleryPhoto): boolean => failedPhotoIds.includes(photo.id);
  const markPhotoFailed = (photoId: string): void => {
    setFailedPhotoIds((current) => (current.includes(photoId) ? current : [...current, photoId]));
  };

  return (
    <div className={styles.gallery}>
      <div className={styles.galleryFrame}>
        {activePhoto.url && !isBroken(activePhoto) ? (
          <img
            src={activePhoto.url}
            alt={`${title} — ${activePhoto.label}`}
            className={styles.galleryImage}
            onError={() => {
              markPhotoFailed(activePhoto.id);
            }}
          />
        ) : (
          <div className={styles.galleryPlaceholder} style={{ background: activePhoto.bg }}>
            <IconCar size={80} strokeWidth={1.25} className={styles.galleryPlaceholderIcon} />
            <div className={styles.galleryPlaceholderLabel}>{activePhoto.label.toUpperCase()}</div>
          </div>
        )}

        <div className={styles.galleryCounter}>
          {active + 1} / {photos.length}
        </div>

        <button
          type="button"
          className={styles.galleryExpandButton}
          onClick={() => setIsExpanded(true)}
          aria-label="Expand gallery"
          aria-haspopup="dialog"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
          </svg>
          Expand
        </button>

        {active > 0 ? (
          <button
            type="button"
            className={`${styles.galleryNav} ${styles.galleryNavLeft}`}
            onClick={() => setActive((current) => Math.max(0, current - 1))}
            aria-label="Previous photo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : null}

        {active < photos.length - 1 ? (
          <button
            type="button"
            className={`${styles.galleryNav} ${styles.galleryNavRight}`}
            onClick={() => setActive((current) => Math.min(photos.length - 1, current + 1))}
            aria-label="Next photo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className={styles.thumbnailRow}>
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            className={`${styles.thumbnailButton} ${index === active ? styles.thumbnailActive : ""}`}
            onClick={() => setActive(index)}
            aria-label={`View ${photo.label}`}
            style={!photo.url || isBroken(photo) ? { background: photo.bg } : undefined}
          >
            {photo.url && !isBroken(photo) ? (
              <img
                src={photo.url}
                alt={photo.label}
                className={styles.thumbnailImage}
                onError={() => {
                  markPhotoFailed(photo.id);
                }}
              />
            ) : (
              <span className={styles.thumbnailPlaceholder}>🚙</span>
            )}
          </button>
        ))}
      </div>

      <GalleryLightbox
        isOpen={isExpanded}
        title={title}
        photos={photos}
        activeIndex={active}
        failedPhotoIds={failedPhotoIds}
        onSelect={setActive}
        onClose={() => setIsExpanded(false)}
        onPhotoError={(photo) => {
          markPhotoFailed(photo.id);
        }}
      />
    </div>
  );
}

function SpecGrid({ specs }: { specs: SpecRow[] }) {
  return (
    <div className={styles.specGrid}>
      {specs.map((spec) => (
        <div key={spec.label} className={styles.specCard}>
          <div className={styles.specLabel}>{spec.label}</div>
          <div
            className={`${styles.specValue} ${spec.green ? styles.specValueGreen : ""} ${spec.mono ? styles.specValueMono : ""}`}
          >
            {spec.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function BidFeedItem({ entry }: { entry: BidFeedEntry }) {
  return (
    <div className={`${styles.feedItem} ${styles.feedItemVisible}`}>
      <div className={styles.feedAvatarWrap}>
        <div
          className={`${styles.feedAvatar} ${entry.isLeader ? styles.feedAvatarLeader : entry.isMine ? styles.feedAvatarMine : ""}`}
        >
          {entry.initials}
        </div>
        {entry.flag ? <div className={styles.feedFlag}>{entry.flag}</div> : null}
      </div>

      <div className={styles.feedText}>
        <div
          className={`${styles.feedPrimary} ${
            entry.isLeader ? styles.feedPrimaryLeader : entry.isMine ? styles.feedPrimaryMine : ""
          }`}
        >
          {entry.locationLabel}
        </div>
        <div className={styles.feedSecondary}>{timeAgo(entry.timestamp)}</div>
      </div>

      <div
        className={`${styles.feedAmount} ${
          entry.isLeader ? styles.feedAmountLeader : entry.isMine ? styles.feedAmountMine : ""
        }`}
      >
        {formatAed(entry.amount)}
      </div>
    </div>
  );
}

function FuseBidButton(props: {
  nextAmount: number;
  fuseProgress: number;
  fuseSeconds: number;
  callRound: number;
  isLoading: boolean;
  disabled: boolean;
  bidStep: number;
  onBid: () => void;
}) {
  const { nextAmount, fuseProgress, fuseSeconds, callRound, isLoading, disabled, bidStep, onBid } = props;
  const hasTimer = fuseProgress > 0;
  const isOrange = callRound === 1;
  const isRed = callRound >= 2;
  const fuseColor = isRed ? "#ef4444" : isOrange ? "#f97316" : "#116a43";
  const fuseGlow = isRed ? "rgba(239,68,68,.5)" : isOrange ? "rgba(249,115,22,.4)" : "rgba(17,106,67,.35)";
  const buttonClassName = isRed ? styles.btnRed : isOrange ? styles.btnOrange : "";
  const mainLabel = isLoading
    ? "Placing bid…"
    : isRed
      ? `Final Chance — ${formatAed(nextAmount)}`
      : isOrange
        ? `Last Chance — ${formatAed(nextAmount)}`
        : `Bid ${formatAed(nextAmount)}`;
  const subLabel = isLoading
    ? null
    : isRed
      ? "Going twice..."
      : isOrange
        ? "Going once..."
        : `+${formatAed(bidStep)} next step`;

  return (
    <div className={styles.fuseButtonShell}>
      <div
        className={`${styles.fuseTimerWrap} ${hasTimer ? styles.fuseTimerWrapActive : ""}`}
        style={
          {
            "--fuse-color": fuseColor,
            "--fuse-glow": fuseGlow,
          } as CSSProperties
        }
      >
        {hasTimer ? (
          <>
            <div className={styles.fuseTrack}>
              <div className={styles.fuseFill} style={{ width: `${fuseProgress}%` }} />
            </div>
            <div className={styles.fuseTip} style={{ left: `calc(${fuseProgress}% - 6px)` }} />
            <div className={styles.fuseSeconds}>{fuseSeconds}s</div>
          </>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onBid}
        disabled={disabled || isLoading}
        className={`${styles.bidButton} ${hasTimer ? styles.bidButtonWithTimer : styles.bidButtonIdle} ${buttonClassName}`}
        style={
          {
            "--fuse-color": fuseColor,
            "--fuse-progress": `${fuseProgress}%`,
          } as CSSProperties
        }
      >
        {!disabled && !isLoading ? <div className={styles.bidButtonShine} /> : null}
        {hasTimer ? <div className={styles.bidButtonFuseGlow} /> : null}

        <div className={styles.bidButtonInner}>
          <div className={styles.bidButtonMain}>{mainLabel}</div>
          {subLabel ? <div className={styles.bidButtonSub}>{subLabel}</div> : null}
        </div>
      </button>
    </div>
  );
}

function AuctionClosedOverlay(props: {
  totalLots: number;
  totalBidsPlaced: number;
  locale: "en" | "ru";
}) {
  const { totalLots, totalBidsPlaced, locale } = props;

  return (
    <div className={`${styles.winnerOverlay} ${styles.auctionClosedOverlay} ${styles.winnerOverlayVisible}`}>
      <div className={`${styles.winnerSurface} ${styles.auctionClosedSurface}`}>
        <div className={styles.auctionClosedIconWrap}>
          <div className={styles.auctionClosedIcon}>✓</div>
        </div>
        <div className={styles.winnerTitle}>Auction Closed</div>
        <div className={styles.winnerMeta}>All lots have been sold</div>
        <div className={styles.auctionClosedDivider} />
        <div className={styles.auctionClosedStats}>
          <div className={styles.auctionClosedStat}>
            <div className={styles.winnerKicker}>Total lots sold</div>
            <div className={styles.auctionClosedStatValue}>{totalLots}</div>
          </div>
          <div className={styles.auctionClosedStat}>
            <div className={styles.winnerKicker}>Total bids placed</div>
            <div className={styles.auctionClosedStatValue}>{totalBidsPlaced}</div>
          </div>
        </div>
        <div className={styles.winnerLoading}>Thank you for participating</div>
        <Link href={withLocalePath("/auctions", locale)} className={styles.auctionClosedButton}>
          View Results →
        </Link>
      </div>
    </div>
  );
}

async function loadLotView(auctionId: string): Promise<EventLotView | null> {
  try {
    const payload = await api.auctions.get<Record<string, unknown>>(auctionId, {
      cache: "no-store",
    });

    return mapAuctionPayloadToEventLotView(payload, auctionId);
  } catch {
    return null;
  }
}

export function EventLiveRoom({ eventId, initialRuntime, initialLot }: Props) {
  const pathname = usePathname();
  const locale = useMemo(() => getLocaleFromPathname(pathname), [pathname]);
  const [socketEnabled, setSocketEnabled] = useState(initialRuntime.state !== "CLOSED");
  const { runtime: liveRuntime, connectionState } = useEventLiveSocket(eventId, socketEnabled);
  const runtime = liveRuntime ?? initialRuntime;
  const currentAuctionId = runtime.currentLot?.auctionId ?? null;
  const currentSnapshot = runtime.currentLot?.snapshot ?? null;
  const [lotView, setLotView] = useState<EventLotView | null>(
    initialLot && initialLot.auctionId === currentAuctionId ? initialLot : null,
  );
  const [bidFeed, setBidFeed] = useState<BidFeedEntry[]>([]);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pulseCurrentBid, setPulseCurrentBid] = useState(false);
  const [fuseProgress, setFuseProgress] = useState(0);
  const [fuseSeconds, setFuseSeconds] = useState(0);
  const [countdownMs, setCountdownMs] = useState(() => Math.max(0, Date.parse(initialRuntime.scheduledAt) - Date.now()));
  const [totalBidsPlaced, setTotalBidsPlaced] = useState(initialRuntime.currentLot?.snapshot.totalBids ?? 0);
  const fuseRef = useRef<number | null>(null);
  const countedLotsRef = useRef(new Set<string>());
  const previousLotRef = useRef<{ lotId: string; totalBids: number } | null>(
    initialRuntime.currentLot
      ? {
          lotId: initialRuntime.currentLot.lotId,
          totalBids: initialRuntime.currentLot.snapshot.totalBids,
        }
      : null,
  );
  const previousPriceRef = useRef<number>(initialRuntime.currentLot?.snapshot.currentPrice ?? 0);

  const sessionId = useMemo(() => formatSessionId(eventId), [eventId]);
  const photos = useMemo(() => buildGalleryPhotos(lotView), [lotView]);
  const specs = useMemo(() => buildSpecRows(lotView), [lotView]);
  const currentPositionLabel = runtime.currentLot ? `Lot ${runtime.currentLot.position + 1} of ${runtime.totalLots}` : `0 / ${runtime.totalLots}`;
  const summaryFacts = useMemo(
    () =>
      [
        lotView?.year ? String(lotView.year) : null,
        lotView?.mileageKm && lotView.mileageKm > 0 ? `${lotView.mileageKm.toLocaleString("en-AE")} km` : null,
      ].filter((fact): fact is string => fact !== null),
    [lotView],
  );
  const hasDamage = useMemo(() => {
    if (!lotView?.damage) {
      return false;
    }

    return !["None", "Not specified", "—"].includes(lotView.damage);
  }, [lotView?.damage]);
  const specPills = useMemo(
    () =>
      [
        lotView?.regionSpec && lotView.regionSpec !== "Not specified" ? `${lotView.regionSpec} spec` : null,
        lotView?.fuelType && lotView.fuelType !== "Not specified" ? lotView.fuelType : null,
      ].filter((pill): pill is string => Boolean(pill && pill.trim())),
    [lotView?.fuelType, lotView?.regionSpec],
  );
  const countdownParts = useMemo(() => formatCountdownParts(countdownMs), [countdownMs]);
  const nextBidAmount = currentSnapshot ? currentSnapshot.currentPrice + currentSnapshot.minIncrement : 0;

  useEffect(() => {
    if (runtime.state === "CLOSED") {
      setSocketEnabled(false);
    }
  }, [runtime.state]);

  useEffect(() => {
    if (runtime.state !== "SCHEDULED") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCountdownMs(Math.max(0, Date.parse(runtime.scheduledAt) - Date.now()));
    }, 1_000);

    setCountdownMs(Math.max(0, Date.parse(runtime.scheduledAt) - Date.now()));

    return () => {
      window.clearInterval(timer);
    };
  }, [runtime.scheduledAt, runtime.state]);

  useEffect(() => {
    if (!currentAuctionId) {
      setLotView(null);
      return undefined;
    }

    if (initialLot && initialLot.auctionId === currentAuctionId) {
      setLotView(initialLot);
      return undefined;
    }

    let active = true;

    void loadLotView(currentAuctionId).then((nextLot) => {
      if (active) {
        setLotView(nextLot);
      }
    });

    return () => {
      active = false;
    };
  }, [currentAuctionId, initialLot]);

  useEffect(() => {
    if (!currentAuctionId) {
      setBidFeed([]);
      return undefined;
    }

    let active = true;

    void api.ui.auctions
      .bids(currentAuctionId, undefined, {
        cache: "no-store",
      })
      .then((response) => {
        if (!active) {
          return;
        }

        setBidFeed(mapBidFeed(response.bids));
      })
      .catch(() => {
        if (active) {
          setBidFeed([]);
        }
      });

    return () => {
      active = false;
    };
  }, [currentAuctionId, currentSnapshot?.lastBid?.id]);

  useEffect(() => {
    if (!runtime.currentLot) {
      if (previousLotRef.current && !countedLotsRef.current.has(previousLotRef.current.lotId)) {
        countedLotsRef.current.add(previousLotRef.current.lotId);
        setTotalBidsPlaced((current) => current + previousLotRef.current!.totalBids);
      }

      previousLotRef.current = null;
      return;
    }

    const previousLot = previousLotRef.current;

    if (previousLot && previousLot.lotId !== runtime.currentLot.lotId && !countedLotsRef.current.has(previousLot.lotId)) {
      countedLotsRef.current.add(previousLot.lotId);
      setTotalBidsPlaced((current) => current + previousLot.totalBids);
    }

    previousLotRef.current = {
      lotId: runtime.currentLot.lotId,
      totalBids: runtime.currentLot.snapshot.totalBids,
    };
  }, [runtime.currentLot]);

  useEffect(() => {
    if (!runtime.currentLot) {
      setFuseProgress(0);
      setFuseSeconds(0);

      if (fuseRef.current !== null) {
        window.clearInterval(fuseRef.current);
        fuseRef.current = null;
      }

      return undefined;
    }

    const callEndsAtMs = Date.parse(runtime.currentLot.callEndsAt);
    const durationMs = runtime.currentLot.callRound >= 1 ? LAST_CHANCE_FUSE_DURATION_MS : NORMAL_FUSE_DURATION_MS;
    const startAtMs = callEndsAtMs - durationMs;

    const tick = () => {
      const remainingMs = Math.max(0, callEndsAtMs - Date.now());
      const elapsedMs = Math.max(0, Date.now() - startAtMs);
      const progress = Math.max(0, Math.min(100, 100 - (elapsedMs / durationMs) * 100));

      setFuseProgress(progress);
      setFuseSeconds(Math.max(0, Math.ceil(remainingMs / 1_000)));
    };

    tick();

    if (fuseRef.current !== null) {
      window.clearInterval(fuseRef.current);
    }

    fuseRef.current = window.setInterval(tick, FUSE_TICK_INTERVAL_MS);

    return () => {
      if (fuseRef.current !== null) {
        window.clearInterval(fuseRef.current);
        fuseRef.current = null;
      }
    };
  }, [runtime.currentLot?.callEndsAt, runtime.currentLot?.callRound, runtime.currentLot?.lotId]);

  useEffect(() => {
    if (!currentSnapshot) {
      previousPriceRef.current = 0;
      return;
    }

    if (currentSnapshot.currentPrice > previousPriceRef.current) {
      setPulseCurrentBid(true);
      const timer = window.setTimeout(() => {
        setPulseCurrentBid(false);
      }, 550);
      previousPriceRef.current = currentSnapshot.currentPrice;

      return () => window.clearTimeout(timer);
    }

    previousPriceRef.current = currentSnapshot.currentPrice;
    return undefined;
  }, [currentSnapshot?.currentPrice]);

  useEffect(() => {
    if (!inlineError) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setInlineError(null);
    }, 3_000);

    return () => window.clearTimeout(timer);
  }, [inlineError]);

  const handleBid = async () => {
    if (!currentSnapshot || !runtime.currentLot || isSubmittingBid) {
      return;
    }

    setIsSubmittingBid(true);
    setInlineError(null);

    try {
      await api.bids.placeBid(runtime.currentLot.auctionId, nextBidAmount, crypto.randomUUID?.() ?? `${Date.now()}`);
    } catch (error) {
      setInlineError(getApiErrorMessage(error, "Bid failed — please try again"));
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const scheduledAtLabel = useMemo(() => formatScheduledAt(runtime.scheduledAt, locale), [locale, runtime.scheduledAt]);

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link href={withLocalePath("/auctions", locale)} className={styles.brand}>
            <span className={styles.brandMark}>FB</span>
            <span className={styles.brandText}>FleetBid</span>
          </Link>
          <span className={styles.topDivider} />
          <span className={styles.sessionId}>{sessionId}</span>
        </div>

        <div className={styles.topBarRight}>
          <span className={`${styles.livePill} ${getStatusClassName(runtime.state)}`}>
            <span className={`${styles.connectionDot} ${getConnectionClassName(connectionState)}`} />
            {getStatusLabel(runtime.state)}
          </span>
          <span className={styles.topMeta}>
            <IconEye size={14} strokeWidth={1.7} />
            --
          </span>
          <span className={styles.topMeta}>{currentPositionLabel}</span>
        </div>
      </header>

      <div className={styles.bodyGrid}>
        <div className={styles.leftPane}>
          <div className={styles.heroRow}>
            <div className={styles.leftColumn}>
              {lotView ? (
                <>
                  <section className={styles.lotHeader}>
                    <div className={styles.lotHeaderRow}>
                      <span className={styles.lotBadge}>LOT {formatLotNumber(lotView.lotNumber)}</span>
                    </div>

                    <div className={styles.titleBar}>
                      <div className={styles.titleLeft}>
                        <h1 className={styles.lotTitle}>{lotView.title}</h1>

                        <div className={styles.quickMeta}>
                          <div className={styles.quickMetaFacts}>
                            {summaryFacts.map((fact, index) => (
                              <span key={fact}>
                                {index > 0 ? <span className={styles.metaDot}>·</span> : null}
                                {fact}
                              </span>
                            ))}
                            {hasDamage ? (
                              <>
                                {summaryFacts.length > 0 ? <span className={styles.metaDot}>·</span> : null}
                                <span className={styles.damage}>Damage reported</span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {specPills.length > 0 ? (
                          <div className={styles.specPills}>
                            {specPills.map((pill) => (
                              <span key={pill} className={styles.specPill}>
                                {pill}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <Gallery
                    lotKey={`${runtime.currentLot?.lotId ?? "none"}-${lotView.auctionId}`}
                    photos={photos}
                    title={lotView.title}
                  />

                  <section className={styles.block}>
                    <div className={styles.blockLabel}>Vehicle Details</div>
                    <SpecGrid specs={specs} />
                  </section>
                </>
              ) : (
                <section className={styles.lotHeader}>
                  <div className={styles.lotTitle}>Loading current lot…</div>
                </section>
              )}
            </div>

            <aside className={styles.rightPane}>
              {runtime.state === "SCHEDULED" ? (
                <div className={styles.prelivePanel}>
                  <div className={styles.preliveHero}>
                    <div className={styles.preliveEyebrow}>Coming soon room</div>
                    <div className={styles.preliveTitle}>Auction starts at {scheduledAtLabel}</div>
                    <p className={styles.preliveBody}>
                      The live room is open early so buyers can review the lineup, prepare deposits, and be ready when the first lot goes on block.
                    </p>
                  </div>

                  <div className={styles.preliveCountdown}>
                    <div className={styles.preliveTimeCard}>
                      <div className={styles.preliveTimeValue}>{countdownParts.hours}</div>
                      <div className={styles.preliveTimeLabel}>Hours</div>
                    </div>
                    <div className={styles.preliveTimeCard}>
                      <div className={styles.preliveTimeValue}>{countdownParts.minutes}</div>
                      <div className={styles.preliveTimeLabel}>Minutes</div>
                    </div>
                    <div className={styles.preliveTimeCard}>
                      <div className={styles.preliveTimeValue}>{countdownParts.seconds}</div>
                      <div className={styles.preliveTimeLabel}>Seconds</div>
                    </div>
                  </div>

                  <div className={styles.preliveChecklist}>
                    <div className={styles.preliveChecklistItem}>Check your buyer account and deposit before the room goes live.</div>
                    <div className={styles.preliveChecklistItem}>Only one lot is active at a time, and late joiners will always land on the current lot.</div>
                    <div className={styles.preliveChecklistItem}>Lots will follow the admin queue exactly as shown below.</div>
                  </div>
                </div>
              ) : runtime.currentLot && currentSnapshot ? (
                <>
                  <div className={styles.currentBidSection}>
                    <div className={styles.blockLabel}>
                      {currentSnapshot.totalBids > 0 ? "Current Bid" : "Starting Bid"}
                    </div>
                    <div className={`${styles.currentBidValue} ${pulseCurrentBid ? styles.currentBidValuePulse : ""}`}>
                      {formatAed(currentSnapshot.totalBids > 0 ? currentSnapshot.currentPrice : currentSnapshot.startingPrice)}
                    </div>

                    <div className={styles.statsRow}>
                      <div className={styles.statItem}>
                        <div className={styles.statLabel}>Bids</div>
                        <div className={styles.statValue}>{currentSnapshot.totalBids}</div>
                      </div>
                      <div className={styles.statItem}>
                        <div className={styles.statLabel}>Step</div>
                        <div className={`${styles.statValue} ${styles.statValueAccent}`}>+{formatAed(currentSnapshot.minIncrement)}</div>
                      </div>
                      <div className={styles.statItem}>
                        <div className={styles.statLabel}>Started</div>
                        <div className={styles.statValue}>{formatAed(currentSnapshot.startingPrice)}</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.bidPanel}>
                    <FuseBidButton
                      nextAmount={nextBidAmount}
                      fuseProgress={fuseProgress}
                      fuseSeconds={fuseSeconds}
                      callRound={runtime.currentLot.callRound}
                      isLoading={isSubmittingBid}
                      disabled={runtime.state !== "LIVE"}
                      bidStep={currentSnapshot.minIncrement}
                      onBid={handleBid}
                    />

                    {inlineError ? <div className={styles.inlineError}>{inlineError}</div> : null}
                  </div>

                  <div className={styles.feedSection}>
                    <div className={styles.feedHeader}>
                      <div className={styles.blockLabel}>Live Bids</div>
                      <div className={styles.feedHeaderMeta}>
                        <IconUsers size={14} strokeWidth={1.8} />
                        {currentSnapshot.totalBids} total
                      </div>
                    </div>

                    <div className={styles.feedScroller}>
                      {bidFeed.length === 0 ? (
                        <div className={styles.feedEmpty}>No bids yet — be the first</div>
                      ) : (
                        bidFeed.map((entry) => <BidFeedItem key={entry.id} entry={entry} />)
                      )}
                    </div>
                  </div>

                  <div className={styles.footerMeta}>
                    <div className={styles.footerMetaItem}>
                      <IconClock size={14} strokeWidth={1.8} />
                      {fuseSeconds > 0 ? `${String(fuseSeconds).padStart(2, "0")}s` : "00s"}
                    </div>
                    <div className={styles.footerMetaItem}>
                      <IconTag size={14} strokeWidth={1.8} />
                      {getStatusLabel(runtime.state)}
                    </div>
                    <div className={styles.footerMetaItem}>
                      <IconZap size={14} strokeWidth={1.8} />
                      WS {connectionState}
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.outcomePanel}>
                  <div className={styles.outcomePanelEyebrow}>Live event</div>
                  <div className={styles.outcomePanelTitle}>Waiting for the next active lot</div>
                  <p className={styles.outcomePanelBody}>
                    This event is live, but no lot is currently on block. Stay in the room and the next vehicle will appear automatically.
                  </p>
                </div>
              )}

              <div className={styles.planSection}>
                <div className={styles.blockLabel}>Auction Plan</div>
                {runtime.upcomingLots.length > 0 ? (
                  <div className={styles.planTrack}>
                    {runtime.upcomingLots.map((lot) => (
                      <div key={`${lot.position}-${lot.auctionId}`} className={styles.planStep}>
                        <div className={styles.planIndex}>{lot.position + 1}</div>
                        <div className={styles.planContent}>
                          <div className={styles.planLot}>LOT {String(lot.position + 1).padStart(3, "0")}</div>
                          <div className={styles.planTitle}>{lot.title}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.planEmpty}>No upcoming lots in this session yet</div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {runtime.state === "CLOSED" ? (
        <AuctionClosedOverlay totalLots={runtime.totalLots} totalBidsPlaced={totalBidsPlaced} locale={locale} />
      ) : null}
    </div>
  );
}

export function mapInitialLotToEventView(lot: LotDetail | null): EventLotView | null {
  if (!lot) {
    return null;
  }

  return mapServerLotToEventLotView(lot);
}
