"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { LotResultOverlay, type LotResultOverlayScenario } from "./LotResultOverlay";

const NORMAL_FUSE_DURATION_MS = 20_000;
const LAST_CHANCE_FUSE_DURATION_MS = 10_000;
const FUSE_TICK_INTERVAL_MS = 50;
const DEFAULT_INTERMISSION_SECONDS = 5;
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

type PreviousLotResult = {
  lotId: string;
  totalBids: number;
  winningPrice: number;
  viewerWon: boolean;
  userBidCount: number;
  vehicle: {
    make: string;
    model: string;
    year: number;
    mileage: number;
    fuelType: string;
    specRegion: string;
  };
  vehicleImage?: string;
};

type LotResultOverlayState = {
  scenario: LotResultOverlayScenario;
  winningPrice: number;
  vehicle: PreviousLotResult["vehicle"];
  vehicleImage?: string;
  userBidCount: number;
  countdownSeconds: number;
  stats?: {
    totalLots: number;
    soldCount: number;
    lotsWonByUser: number;
    totalBidsByUser: number;
  };
};

type ViewerState = {
  checked: boolean;
  authenticated: boolean;
  isBuyer: boolean;
  userStatus: string | null;
  companyStatus: string | null;
  kycVerified: boolean;
  hasRequiredDeposit: boolean;
  buyerTier: "STANDARD" | "VIP" | null;
};

type ViewerWalletSummary = {
  balance: number;
  lockedBalance: number;
  availableBalance: number;
};

type QueuedLotCard = {
  auctionId: string;
  position: number;
  title: string;
  startingPrice: number;
  currentPrice: number;
  totalBids: number;
  imageUrl: string | null;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  regionSpec: string;
  fuelType: string;
};

type AuthMeResponse = {
  user?: {
    role?: string;
    status?: string;
    kycVerified?: boolean;
    companyUsers?: Array<{
      company?: {
        buyerTier?: "STANDARD" | "VIP" | null;
        status?: string | null;
      } | null;
    }>;
  };
};

type BuyerDashboardResponse = {
  depositStatus?: {
    hasRequiredDeposit?: boolean;
  };
  vipStatus?: {
    tier?: "STANDARD" | "VIP";
  };
};

type WalletResponse = {
  wallet?: {
    balance?: number;
    lockedBalance?: number;
    availableBalance?: number;
  };
};

const DEFAULT_VIEWER_STATE: ViewerState = {
  checked: false,
  authenticated: false,
  isBuyer: false,
  userStatus: null,
  companyStatus: null,
  kycVerified: false,
  hasRequiredDeposit: false,
  buyerTier: null,
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

function buildQueueMeta(lot: QueuedLotCard): string {
  return [
    lot.mileageKm > 0 ? `${lot.mileageKm.toLocaleString("en-AE")} km` : null,
    lot.regionSpec && lot.regionSpec !== "Not specified" ? lot.regionSpec : null,
    lot.fuelType && lot.fuelType !== "Not specified" ? lot.fuelType : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
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

  useEffect(() => {
    setActive(0);
    setFailedPhotoIds([]);
  }, [lotKey]);

  const activePhoto = photos[active] ?? photos[0];

  if (!activePhoto) {
    return null;
  }

  const isBroken = (photo: GalleryPhoto): boolean => failedPhotoIds.includes(photo.id);

  return (
    <div className={styles.gallery}>
      <div className={styles.galleryFrame}>
        {activePhoto.url && !isBroken(activePhoto) ? (
          <img
            src={activePhoto.url}
            alt={`${title} — ${activePhoto.label}`}
            className={styles.galleryImage}
            onError={() => {
              setFailedPhotoIds((current) => (current.includes(activePhoto.id) ? current : [...current, activePhoto.id]));
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
                  setFailedPhotoIds((current) => (current.includes(photo.id) ? current : [...current, photo.id]));
                }}
              />
            ) : (
              <span className={styles.thumbnailPlaceholder}>🚙</span>
            )}
          </button>
        ))}
      </div>
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
  const fuseColor = fuseSeconds <= 3 ? "#ef4444" : fuseSeconds <= 10 ? "#f59e0b" : "#116a43";
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
  const { runtime: liveRuntime, connectionState, refreshRuntime } = useEventLiveSocket(eventId, socketEnabled);
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
  const [countdownMs, setCountdownMs] = useState(0);
  const [totalBidsPlaced, setTotalBidsPlaced] = useState(initialRuntime.currentLot?.snapshot.totalBids ?? 0);
  const [userBidsPlacedTotal, setUserBidsPlacedTotal] = useState(0);
  const [soldLotsTotal, setSoldLotsTotal] = useState(0);
  const [lotsWonTotal, setLotsWonTotal] = useState(0);
  const [viewer, setViewer] = useState<ViewerState>(DEFAULT_VIEWER_STATE);
  const [viewerWallet, setViewerWallet] = useState<ViewerWalletSummary>({
    balance: 0,
    lockedBalance: 0,
    availableBalance: 0,
  });
  const [queuedLots, setQueuedLots] = useState<QueuedLotCard[]>([]);
  const [eventTitle, setEventTitle] = useState("Auction session");
  const [resultOverlay, setResultOverlay] = useState<LotResultOverlayState | null>(null);
  const fuseRef = useRef<number | null>(null);
  const countedLotsRef = useRef(new Set<string>());
  const shownLotResultRef = useRef(new Set<string>());
  const previousLotResultRef = useRef<PreviousLotResult | null>(null);
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
  const isReadyToBid = viewer.checked && viewer.authenticated && viewer.hasRequiredDeposit;
  const waitingProgressPercent = useMemo(() => {
    const totalWindowMs = 24 * 60 * 60 * 1000;
    const elapsedMs = Math.max(0, Math.min(totalWindowMs, totalWindowMs - countdownMs));

    return Math.max(0, Math.min(100, (elapsedMs / totalWindowMs) * 100));
  }, [countdownMs]);
  const walletProgressPercent = useMemo(
    () => Math.max(0, Math.min(100, (viewerWallet.availableBalance / 50_000) * 100)),
    [viewerWallet.availableBalance],
  );
  const minutesToStart = useMemo(() => Math.max(1, Math.ceil(countdownMs / 60_000)), [countdownMs]);

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
    let active = true;

    async function loadViewerState(): Promise<void> {
      try {
        const authPayload = await api.auth.me<AuthMeResponse>({ cache: "no-store" });

        if (!active) {
          return;
        }

        const user = authPayload.user;
        const primaryCompany = user?.companyUsers?.[0]?.company ?? null;
        const isBuyer = user?.role === "BUYER";
        const baseViewer: ViewerState = {
          checked: true,
          authenticated: true,
          isBuyer,
          userStatus: user?.status ?? null,
          companyStatus: primaryCompany?.status ?? null,
          kycVerified: user?.kycVerified === true,
          hasRequiredDeposit: false,
          buyerTier: primaryCompany?.buyerTier ?? null,
        };

        if (!isBuyer) {
          setViewer(baseViewer);
          return;
        }

        const [dashboard, wallet] = await Promise.all([
          api.buyer.dashboard<BuyerDashboardResponse>({ cache: "no-store" }).catch(() => null),
          api.wallet.get<WalletResponse>({ cache: "no-store" }).catch(() => null),
        ]);

        if (!active) {
          return;
        }

        setViewer({
          ...baseViewer,
          hasRequiredDeposit: dashboard?.depositStatus?.hasRequiredDeposit === true,
          buyerTier: dashboard?.vipStatus?.tier ?? baseViewer.buyerTier ?? "STANDARD",
        });

        setViewerWallet({
          balance: Number(wallet?.wallet?.balance ?? 0),
          lockedBalance: Number(wallet?.wallet?.lockedBalance ?? 0),
          availableBalance: Number(wallet?.wallet?.availableBalance ?? 0),
        });
      } catch {
        if (active) {
          setViewer({
            ...DEFAULT_VIEWER_STATE,
            checked: true,
          });
          setViewerWallet({
            balance: 0,
            lockedBalance: 0,
            availableBalance: 0,
          });
        }
      }
    }

    void loadViewerState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (runtime.state !== "SCHEDULED") {
      setQueuedLots([]);
      return undefined;
    }

    let active = true;

    void api.admin.events
      .getAdminEventLots(eventId, { cache: "no-store" })
      .then((response) => {
        if (!active) {
          return;
        }

        if (response.event.title?.trim()) {
          setEventTitle(response.event.title.trim());
        }
      })
      .catch(() => {
        if (active) {
          setEventTitle("Auction session");
        }
      });

    void Promise.all(
      runtime.upcomingLots.map(async (lot) => {
        const detail = await loadLotView(lot.auctionId);

        return {
          auctionId: lot.auctionId,
          position: lot.position,
          title: detail?.title ?? lot.title,
          startingPrice: lot.startingPrice,
          currentPrice: lot.currentPrice,
          totalBids: lot.totalBids,
          imageUrl: detail?.images[0] ? normalizeGalleryUrl(detail.images[0]) : null,
          make: detail?.make ?? "",
          model: detail?.model ?? lot.title,
          year: detail?.year ?? 0,
          mileageKm: detail?.mileageKm ?? 0,
          regionSpec: detail?.regionSpec ?? "",
          fuelType: detail?.fuelType ?? "",
        } satisfies QueuedLotCard;
      }),
    ).then((nextLots) => {
      if (active) {
        setQueuedLots(nextLots);
      }
    });

    return () => {
      active = false;
    };
  }, [eventId, runtime.state, runtime.upcomingLots]);

  useEffect(() => {
    if (!runtime.currentLot || !currentSnapshot) {
      return;
    }

    previousLotResultRef.current = {
      lotId: runtime.currentLot.lotId,
      totalBids: currentSnapshot.totalBids,
      winningPrice: currentSnapshot.totalBids > 0 ? currentSnapshot.currentPrice : currentSnapshot.startingPrice,
      viewerWon: currentSnapshot.totalBids > 0 && bidFeed[0]?.isMine === true,
      userBidCount: bidFeed.reduce((count, entry) => count + (entry.isMine ? 1 : 0), 0),
      vehicle: {
        make: lotView?.make ?? "",
        model: lotView?.model ?? lotView?.title ?? "Lot",
        year: lotView?.year ?? 0,
        mileage: lotView?.mileageKm ?? 0,
        fuelType: lotView?.fuelType ?? "Not specified",
        specRegion: lotView?.regionSpec ?? "Not specified",
      },
      vehicleImage: lotView?.images[0] ? normalizeGalleryUrl(lotView.images[0]) : undefined,
    };
  }, [
    bidFeed,
    currentSnapshot,
    lotView?.fuelType,
    lotView?.images,
    lotView?.make,
    lotView?.mileageKm,
    lotView?.model,
    lotView?.regionSpec,
    lotView?.title,
    lotView?.year,
    runtime.currentLot,
  ]);

  useEffect(() => {
    if (!runtime.currentLot) {
      const previousLot = previousLotRef.current;

      if (previousLot && !countedLotsRef.current.has(previousLot.lotId)) {
        countedLotsRef.current.add(previousLot.lotId);
        setTotalBidsPlaced((current) => current + previousLot.totalBids);
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
    if (runtime.currentLot) {
      setResultOverlay((current) => (current?.scenario === "ended" ? current : null));
      return;
    }

    const previousLotResult = previousLotResultRef.current;

    if (!previousLotResult || shownLotResultRef.current.has(previousLotResult.lotId)) {
      return;
    }

    const isIntermission = (runtime.state as string) === "INTERMISSION" || runtime.state !== "CLOSED";

    if (!isIntermission && runtime.state !== "CLOSED") {
      return;
    }

    shownLotResultRef.current.add(previousLotResult.lotId);

    const nextSoldLotsTotal = soldLotsTotal + (previousLotResult.totalBids > 0 ? 1 : 0);
    const nextLotsWonTotal = lotsWonTotal + (previousLotResult.viewerWon ? 1 : 0);
    const nextUserBidsPlacedTotal = userBidsPlacedTotal + previousLotResult.userBidCount;

    setSoldLotsTotal(nextSoldLotsTotal);
    setLotsWonTotal(nextLotsWonTotal);
    setUserBidsPlacedTotal(nextUserBidsPlacedTotal);

    if (runtime.state === "CLOSED") {
      setResultOverlay({
        scenario: "ended",
        winningPrice: previousLotResult.winningPrice,
        vehicle: previousLotResult.vehicle,
        vehicleImage: previousLotResult.vehicleImage,
        userBidCount: previousLotResult.userBidCount,
        countdownSeconds: 0,
        stats: {
          totalLots: runtime.totalLots,
          soldCount: nextSoldLotsTotal,
          lotsWonByUser: nextLotsWonTotal,
          totalBidsByUser: nextUserBidsPlacedTotal,
        },
      });
      return;
    }

    setResultOverlay({
      scenario:
        previousLotResult.totalBids === 0 ? "unsold" : previousLotResult.viewerWon ? "won" : "sold",
      winningPrice: previousLotResult.winningPrice,
      vehicle: previousLotResult.vehicle,
      vehicleImage: previousLotResult.vehicleImage,
      userBidCount: previousLotResult.userBidCount,
      countdownSeconds: DEFAULT_INTERMISSION_SECONDS,
    });
  }, [lotsWonTotal, runtime.currentLot, runtime.state, runtime.totalLots, soldLotsTotal, userBidsPlacedTotal]);

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
      const message = getApiErrorMessage(error, "Bid failed — please try again");
      if (
        message === "Bid must be higher than current price" ||
        message === "Auction is not active" ||
        message === "Auction has ended"
      ) {
        void refreshRuntime().catch(() => {
          // Best-effort refresh keeps the live room in sync after stale bid attempts.
        });
      }
      setInlineError(message);
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const scheduledAtLabel = useMemo(() => formatScheduledAt(runtime.scheduledAt, locale), [locale, runtime.scheduledAt]);

  return (
    <div className={styles.page}>
      <header className={`${styles.topBar} ${runtime.state === "SCHEDULED" ? styles.topBarPrelive : ""}`}>
        <div className={styles.topBarLeft}>
          <Link href={withLocalePath("/auctions", locale)} className={styles.brand}>
            <span className={`${styles.brandMark} ${runtime.state === "SCHEDULED" ? styles.brandMarkPrelive : ""}`}>FB</span>
            <span className={styles.brandText}>FleetBid</span>
          </Link>
          <span className={styles.topDivider} />
          {runtime.state === "SCHEDULED" ? (
            <>
              <span className={styles.preliveHeaderTitle}>{eventTitle}</span>
              <span className={styles.sessionId}>{eventId}</span>
            </>
          ) : (
            <span className={styles.sessionId}>{sessionId}</span>
          )}
        </div>

        <div className={styles.topBarRight}>
          {runtime.state === "SCHEDULED" ? (
            <span className={styles.preliveHeaderBadge}>COMING SOON</span>
          ) : (
            <>
              <span className={`${styles.livePill} ${getStatusClassName(runtime.state)}`}>
                <span className={`${styles.connectionDot} ${getConnectionClassName(connectionState)}`} />
                {getStatusLabel(runtime.state)}
              </span>
              <span className={styles.topMeta}>
                <IconEye size={14} strokeWidth={1.7} />
                --
              </span>
              <span className={styles.topMeta}>{currentPositionLabel}</span>
            </>
          )}
        </div>
      </header>

      <div className={styles.bodyGrid}>
        <div className={styles.leftPane}>
          {runtime.state === "SCHEDULED" ? (
            <section className={styles.waitingRoom}>
              <div className={styles.waitingRoomGrid}>
                <div className={styles.waitingRoomMain}>
                  <div className={styles.waitingCountdownSection}>
                    <div className={styles.waitingEyebrow}>Auction starts in</div>
                    <div className={styles.waitingCountdownRow}>
                      <div className={styles.waitingTimeUnit}>
                        <div className={styles.waitingTimeValue}>{countdownParts.hours}</div>
                        <div className={styles.waitingTimeLabel}>Hours</div>
                      </div>
                      <div className={styles.waitingTimeSeparator}>:</div>
                      <div className={styles.waitingTimeUnit}>
                        <div className={styles.waitingTimeValue}>{countdownParts.minutes}</div>
                        <div className={styles.waitingTimeLabel}>Minutes</div>
                      </div>
                      <div className={styles.waitingTimeSeparator}>:</div>
                      <div className={styles.waitingTimeUnit}>
                        <div className={styles.waitingTimeValue}>{countdownParts.seconds}</div>
                        <div className={styles.waitingTimeLabel}>Seconds</div>
                      </div>
                    </div>
                    <div className={styles.waitingDateLine}>{scheduledAtLabel}</div>
                    <div className={styles.waitingProgress}>
                      <div className={styles.waitingProgressFill} style={{ width: `${waitingProgressPercent}%` }} />
                    </div>
                  </div>

                  <div className={styles.waitingLineupSection}>
                    <div className={styles.waitingLineupLabel}>Auction plan · {runtime.upcomingLots.length} lots</div>
                    <div className={styles.waitingLineupList}>
                      {(queuedLots.length > 0 ? queuedLots : runtime.upcomingLots.map((lot) => ({
                        auctionId: lot.auctionId,
                        position: lot.position,
                        title: lot.title,
                        startingPrice: lot.startingPrice,
                        currentPrice: lot.currentPrice,
                        totalBids: lot.totalBids,
                        imageUrl: null,
                        make: "",
                        model: lot.title,
                        year: 0,
                        mileageKm: 0,
                        regionSpec: "",
                        fuelType: "",
                      }))).map((lot, index) => {
                        const queueMeta = buildQueueMeta(lot);
                        const rowTitle = [lot.year || null, lot.make, lot.model].filter(Boolean).join(" ") || lot.title;
                        const isNext = index === 0;
                        const displayStartPrice = lot.totalBids > 0 ? lot.currentPrice : lot.startingPrice;

                        return (
                          <div
                            key={`${lot.position}-${lot.auctionId}`}
                            className={`${styles.waitingLotRow} ${isNext ? styles.waitingLotRowFeatured : ""}`}
                            style={{ animationDelay: `${index * 0.2}s` }}
                          >
                            <div className={`${styles.waitingLotPosition} ${isNext ? styles.waitingLotPositionFeatured : ""}`}>
                              {lot.position + 1}
                            </div>
                            <div className={`${styles.waitingLotThumb} ${isNext ? styles.waitingLotThumbFeatured : ""}`}>
                              {lot.imageUrl ? (
                                <img src={lot.imageUrl} alt={rowTitle} className={styles.waitingLotImage} />
                              ) : (
                                <IconCar size={18} strokeWidth={1.7} className={styles.waitingLotPlaceholder} />
                              )}
                            </div>
                            <div className={styles.waitingLotInfo}>
                              <div className={styles.waitingLotTitle}>{rowTitle}</div>
                              <div className={styles.waitingLotMeta}>{queueMeta || "Preview available when the room goes live"}</div>
                            </div>
                            <div className={styles.waitingLotPrice}>
                              <div className={styles.waitingLotPriceLabel}>Start</div>
                              <div className={styles.waitingLotPriceValue}>{formatAed(displayStartPrice)}</div>
                            </div>
                            {isNext ? <div className={styles.waitingLotBadge}>UP NEXT</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <aside className={styles.waitingRoomSidebar}>
                  {!viewer.checked || !viewer.authenticated ? (
                    <>
                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardNeutral} ${styles.waitingStatusCardFade}`}>
                        <div className={styles.waitingLoginCard}>
                          <div className={`${styles.waitingStatusIcon} ${styles.waitingStatusIconReady}`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Z" />
                              <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
                            </svg>
                          </div>
                          <div className={styles.waitingStatusTitle}>Sign in to participate</div>
                          <div className={styles.waitingStatusSub}>
                            Log in to prepare your deposit and bid when the auction starts.
                          </div>
                          <Link href={withLocalePath("/login", locale)} className={`${styles.waitingActionButton} ${styles.waitingActionButtonGreen}`}>
                            Log in to FleetBid
                          </Link>
                          <Link href={withLocalePath("/register", locale)} className={styles.waitingTextLink}>
                            Don&apos;t have an account? Register →
                          </Link>
                        </div>
                      </div>

                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardFade}`} style={{ animationDelay: "0.1s" }}>
                        <div className={styles.waitingLineupLabel}>Rules</div>
                        <div className={styles.waitingRulesList}>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />One lot active at a time</div>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />Late joiners land on current lot</div>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />Lots follow the queue exactly</div>
                        </div>
                        <div className={styles.waitingNote}>
                          Bidding is open to registered buyers with an active approved deposit only.
                        </div>
                      </div>
                    </>
                  ) : isReadyToBid ? (
                    <>
                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardReady} ${styles.waitingStatusCardFade}`}>
                        <div className={styles.waitingStatusRow}>
                          <div className={`${styles.waitingStatusIcon} ${styles.waitingStatusIconReady}`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="m5 12 4 4L19 6" />
                            </svg>
                          </div>
                          <div>
                            <div className={styles.waitingStatusTitle}>Ready to bid</div>
                            <div className={styles.waitingStatusSub}>
                              Deposit approved · {(viewer.buyerTier ?? "STANDARD").charAt(0) + (viewer.buyerTier ?? "STANDARD").slice(1).toLowerCase()} buyer
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardFade}`} style={{ animationDelay: "0.08s" }}>
                        <div className={styles.waitingWalletLabel}>Available</div>
                        <div className={styles.waitingWalletAmount}>{formatAed(viewerWallet.availableBalance)}</div>
                        <div className={`${styles.waitingWalletSub} ${styles.waitingWalletSubSuccess}`}>Deposit approved</div>
                        <div className={styles.waitingWalletTrack}>
                          <div className={styles.waitingWalletFill} style={{ width: `${walletProgressPercent}%` }} />
                        </div>
                      </div>

                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardFade}`} style={{ animationDelay: "0.16s" }}>
                        <div className={styles.waitingLineupLabel}>Participants</div>
                        <div className={styles.waitingParticipantsCard}>
                          <div className={styles.waitingAvatarStack}>
                            <span className={`${styles.waitingAvatar} ${styles.waitingAvatarOne}`}>A</span>
                            <span className={`${styles.waitingAvatar} ${styles.waitingAvatarTwo}`}>M</span>
                            <span className={`${styles.waitingAvatar} ${styles.waitingAvatarThree}`}>R</span>
                            <span className={`${styles.waitingAvatar} ${styles.waitingAvatarFour}`}>K</span>
                          </div>
                          <div className={styles.waitingParticipantsText}>-- buyers in the room</div>
                        </div>
                      </div>

                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardFade}`} style={{ animationDelay: "0.24s" }}>
                        <div className={styles.waitingLineupLabel}>Rules</div>
                        <div className={styles.waitingRulesList}>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />One lot active at a time</div>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />Late joiners land on current lot</div>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />Lots follow the queue exactly</div>
                        </div>
                        <div className={styles.waitingNote}>
                          Bidding is open to registered buyers with an active approved deposit only.
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardWarning} ${styles.waitingStatusCardFade}`}>
                        <div className={styles.waitingStatusRow}>
                          <div className={`${styles.waitingStatusIcon} ${styles.waitingStatusIconWarning}`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                              <path d="M12 9v4" />
                              <path d="M12 17h.01" />
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                            </svg>
                          </div>
                          <div>
                            <div className={`${styles.waitingStatusTitle} ${styles.waitingStatusTitleWarning}`}>Deposit required</div>
                            <div className={styles.waitingStatusSub}>You can&apos;t bid without a deposit</div>
                          </div>
                        </div>
                        <Link href={withLocalePath("/wallet", locale)} className={`${styles.waitingActionButton} ${styles.waitingActionButtonAmber}`}>
                          Top up deposit →
                        </Link>
                      </div>

                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardFade}`} style={{ animationDelay: "0.08s" }}>
                        <div className={styles.waitingWalletLabel}>Available</div>
                        <div className={`${styles.waitingWalletAmount} ${styles.waitingWalletAmountZero}`}>
                          {formatAed(viewerWallet.availableBalance)}
                        </div>
                        <div className={`${styles.waitingWalletSub} ${styles.waitingWalletSubWarning}`}>No deposit on file</div>
                        <div className={styles.waitingWalletTrack}>
                          <div className={styles.waitingWalletFill} style={{ width: "0%" }} />
                        </div>
                      </div>

                      <div className={`${styles.waitingUrgencyCard} ${styles.waitingStatusCardFade}`} style={{ animationDelay: "0.16s" }}>
                        <div className={styles.waitingUrgencyTitle}>Auction starts in {minutesToStart} minutes</div>
                        <div className={styles.waitingUrgencyBody}>
                          Add a deposit now to participate. Fully refundable if you don&apos;t win.
                        </div>
                      </div>

                      <div className={`${styles.waitingStatusCard} ${styles.waitingStatusCardFade}`} style={{ animationDelay: "0.24s" }}>
                        <div className={styles.waitingLineupLabel}>Rules</div>
                        <div className={styles.waitingRulesList}>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />One lot active at a time</div>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />Late joiners land on current lot</div>
                          <div className={styles.waitingRuleRow}><span className={styles.waitingRuleDot} />Lots follow the queue exactly</div>
                        </div>
                        <div className={styles.waitingNote}>
                          Bidding is open to registered buyers with an active approved deposit only.
                        </div>
                      </div>
                    </>
                  )}
                </aside>
              </div>
            </section>
          ) : (
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
                {runtime.currentLot && currentSnapshot ? (
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
          )}
        </div>
      </div>

      {runtime.state === "CLOSED" ? (
        resultOverlay ? (
          <LotResultOverlay
            scenario={resultOverlay.scenario}
            winningPrice={resultOverlay.winningPrice}
            vehicle={resultOverlay.vehicle}
            vehicleImage={resultOverlay.vehicleImage}
            userBidCount={resultOverlay.userBidCount}
            countdownSeconds={resultOverlay.countdownSeconds}
            onComplete={() => {
              if (resultOverlay.scenario !== "ended") {
                setResultOverlay(null);
              }
            }}
            ctaHref={withLocalePath("/my-bids", locale)}
            stats={resultOverlay.stats}
          />
        ) : (
          <AuctionClosedOverlay totalLots={runtime.totalLots} totalBidsPlaced={totalBidsPlaced} locale={locale} />
        )
      ) : resultOverlay ? (
        <LotResultOverlay
          scenario={resultOverlay.scenario}
          winningPrice={resultOverlay.winningPrice}
          vehicle={resultOverlay.vehicle}
          vehicleImage={resultOverlay.vehicleImage}
          userBidCount={resultOverlay.userBidCount}
          countdownSeconds={resultOverlay.countdownSeconds}
          onComplete={() => {
            setResultOverlay(null);
          }}
        />
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
