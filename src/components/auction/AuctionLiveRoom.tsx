"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconCar, IconClock, IconEye, IconTag, IconUsers, IconZap } from "@/components/ui/icons";
import { useAuctionLiveSocket } from "@/src/hooks/useAuctionLiveSocket";
import { getLocaleFromPathname, withLocalePath } from "@/src/i18n/routing";
import type { UiAuctionBidHistoryEntry } from "@/src/lib/api-client";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";
import type { AuctionLiveSnapshot } from "@/src/types/auction";
import type { LotDetail } from "@/app/auctions/[auctionId]/page";

import styles from "./AuctionLiveRoom.module.css";

const FUSE_DURATION_SECONDS = 20;
const FUSE_TICK_INTERVAL_MS = 50;
const WINNER_MS = 3_500;
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

const PLACEHOLDER_PHOTOS = [
  { id: "placeholder-1", label: "Front 3/4", bg: "linear-gradient(135deg,#e8edf2 0%,#cdd5df 100%)" },
  { id: "placeholder-2", label: "Rear 3/4", bg: "linear-gradient(135deg,#dde3ea 0%,#bec8d4 100%)" },
  { id: "placeholder-3", label: "Interior", bg: "linear-gradient(135deg,#ede9e3 0%,#d4cdc4 100%)" },
  { id: "placeholder-4", label: "Dashboard", bg: "linear-gradient(135deg,#e3e8ed 0%,#c8d0d9 100%)" },
  { id: "placeholder-5", label: "Engine Bay", bg: "linear-gradient(135deg,#e6e6e6 0%,#cdcdcd 100%)" },
  { id: "placeholder-6", label: "Odometer", bg: "linear-gradient(135deg,#eaeaea 0%,#d0d0d0 100%)" },
] as const;

type BidFeedEntry = {
  id: string;
  amount: number;
  timestamp: number;
  sequenceNo: number;
  isLeader: boolean;
  isMine: boolean;
  isNew: boolean;
  source: "snapshot" | "optimistic";
  initials: string;
  locationLabel: string;
  flag: string;
};

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

type UpcomingLot = {
  id: string;
  lotNumber: string;
  title: string;
  year: number;
  make: string;
  model: string;
  startingBid: number;
};

type WinnerData = {
  variant: "won" | "sold" | "closed";
  amount: number;
  flag: string;
  isMine: boolean;
  title: string;
  kicker: string;
  label: string;
  nextLot: UpcomingLot | null;
};

type BuyerTier = "STANDARD" | "VIP";

type ViewerState = {
  checked: boolean;
  authenticated: boolean;
  isBuyer: boolean;
  userStatus: string | null;
  companyStatus: string | null;
  kycVerified: boolean;
  hasRequiredDeposit: boolean;
  buyerTier: BuyerTier | null;
};

type AuthMeResponse = {
  user?: {
    role?: string;
    status?: string;
    kycVerified?: boolean;
    companyUsers?: Array<{
      company?: {
        buyerTier?: BuyerTier | null;
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
    tier?: BuyerTier;
  };
};

type RoomMode =
  | "PRELIVE"
  | "LIVE_GUEST"
  | "LIVE_NO_DEPOSIT"
  | "LIVE_READY"
  | "WON"
  | "SOLD_TO_OTHER"
  | "NEXT_LOT"
  | "SESSION_ENDED";

type Props = {
  auctionId: string;
  initialSnapshot: AuctionLiveSnapshot;
  lot: LotDetail;
};

type FuseBidButtonProps = {
  onBid: () => void;
  nextAmount: number;
  bidStep: number;
  fuseProgress: number;
  fuseSeconds: number;
  isLeading: boolean;
  isLoading: boolean;
  disabled: boolean;
  expired: boolean;
  hasBids: boolean;
};

type GalleryProps = {
  lotKey: string;
  photos: GalleryPhoto[];
  title: string;
};

type SpecGridProps = {
  specs: SpecRow[];
};

type BidFeedItemProps = {
  entry: BidFeedEntry;
  isNew: boolean;
};

type WinnerOverlayProps = {
  lot: LotDetail;
  winner: WinnerData;
  heroImageUrl: string | null;
};

type AuctionPlanItem = {
  index: number;
  lotNumber: string;
  title: string;
};

type StateCardConfig = {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  tone?: "default" | "live" | "warning" | "success" | "muted";
};

type CountdownParts = {
  hours: string;
  minutes: string;
  seconds: string;
};

type TransitionState = "idle" | "nextLot" | "sessionEnded";

const API_MEDIA_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ?? "";

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatSessionId(auctionId: string): string {
  return `AUC-${auctionId.slice(0, 8).toUpperCase()}`;
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

function getConnectionClassName(
  state: "connecting" | "connected" | "disconnected" | "error",
): string {
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

function getStatusLabel(state: string): string {
  switch (state) {
    case "LIVE":
      return "LIVE";
    case "EXTENDED":
      return "EXTENDED";
    case "SCHEDULED":
      return "UP NEXT";
    case "PAYMENT_PENDING":
      return "PAYMENT";
    case "CLOSED":
    case "ENDED":
      return "CLOSED";
    default:
      return state;
  }
}

function getStatusClassName(state: string): string {
  switch (state) {
    case "SCHEDULED":
      return styles.livePillScheduled;
    case "PAYMENT_PENDING":
      return styles.livePillWarning;
    case "CLOSED":
    case "ENDED":
    case "DEFAULTED":
      return styles.livePillMuted;
    default:
      return "";
  }
}

function isActiveStatus(value: string | null | undefined): boolean {
  return value?.trim().toUpperCase() === "ACTIVE";
}

function getRemainingMs(endsAt: string | null): number {
  if (!endsAt) {
    return 0;
  }

  const endTime = Date.parse(endsAt);

  if (Number.isNaN(endTime)) {
    return 0;
  }

  return Math.max(0, endTime - Date.now());
}

function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatCountdownParts(ms: number): CountdownParts {
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

function buildStateCardConfig(
  mode: RoomMode,
  viewer: ViewerState,
  countdownMs: number,
  nextBidAmount: number,
): StateCardConfig | null {
  if (mode === "PRELIVE") {
    return {
      eyebrow: "Auction starts in",
      title: formatRemainingTime(countdownMs),
      body:
        "This room will go live automatically. Stay here to follow the countdown, see the bidding order, and be ready for the first call.",
      tone: "default",
    };
  }

  if (mode === "LIVE_GUEST") {
    return {
      eyebrow: "Observer mode",
      title: "Live auction in progress",
      body:
        "You can watch every bid in real time, but only logged-in buyers with a ready deposit can place the next offer.",
      actionLabel: "Log in to bid",
      actionHref: "/login",
      tone: "live",
    };
  }

  if (mode === "LIVE_NO_DEPOSIT") {
    if (!viewer.checked) {
      return {
        eyebrow: "Checking access",
        title: "Syncing your bidding status",
        body: "We are verifying your buyer profile, KYC, and deposit readiness for this live lot.",
        tone: "default",
      };
    }

    if (!viewer.isBuyer) {
      return {
        eyebrow: "Buyer access required",
        title: "Switch to an approved buyer account",
        body: "Live bidding is reserved for buyer workspaces. Sign in with your buyer account to enter this auction.",
        actionLabel: "Go to login",
        actionHref: "/login",
        tone: "warning",
      };
    }

    return {
      eyebrow: "Deposit needed",
      title: "Please add a security deposit to start bidding.",
      body: `Your bid button unlocks as soon as the refundable deposit is ready. Next live offer: ${formatAed(nextBidAmount)}.`,
      actionLabel: "Add Security Deposit",
      actionHref: "/wallet",
      tone: "warning",
    };
  }

  if (mode === "SESSION_ENDED") {
    return {
      eyebrow: "Auction closed",
      title: "Thanks for joining the session",
      body: "This live window is finished. You can move back to the marketplace and join the next auction lineup.",
      actionLabel: "Browse auctions",
      actionHref: "/auctions",
      tone: "muted",
    };
  }

  if (mode === "NEXT_LOT") {
    return {
      eyebrow: "Up next",
      title: "Preparing the next lot",
      body: "The session is moving to the next vehicle. Stay here and the room will refresh with the next bidding target.",
      tone: "success",
    };
  }

  return null;
}

function createFeedEntry(
  amount: number,
  timestamp: number,
  id: string,
  source: "snapshot" | "optimistic",
  isMine = false,
  isNew = true,
  sequenceNo = 0,
): BidFeedEntry {
  return {
    id,
    amount,
    timestamp,
    sequenceNo,
    isLeader: true,
    isMine,
    isNew,
    source,
    initials: isMine ? "YO" : "MK",
    locationLabel: isMine ? "Your company" : "Market",
    flag: "",
  };
}

function normalizeBidFeedEntry(entry: UiAuctionBidHistoryEntry, isNew: boolean): BidFeedEntry {
  return {
    id: entry.id,
    amount: entry.amount_aed,
    timestamp: Date.parse(entry.placed_at),
    sequenceNo: entry.sequence_no,
    isLeader: false,
    isMine: entry.is_mine,
    isNew,
    source: "snapshot",
    initials: entry.company_initials?.trim() || "MK",
    locationLabel: entry.location_label?.trim() || entry.company_name?.trim() || "Market",
    flag: entry.flag?.trim() || "",
  };
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

  if (trimmedUrl.startsWith("uploads/") && API_MEDIA_BASE_URL) {
    return `${API_MEDIA_BASE_URL}/${trimmedUrl}`;
  }

  return `/${trimmedUrl}`;
}

function buildGalleryPhotos(lot: LotDetail): GalleryPhoto[] {
  const lotWithMedia = lot as LotDetail & {
    media?: Array<{
      url?: string | null;
      label?: string | null;
    }> | null;
  };

  if (Array.isArray(lotWithMedia.media) && lotWithMedia.media.length > 0) {
    return lotWithMedia.media
      .filter((item) => typeof item?.url === "string" && item.url.trim().length > 0)
      .map((item, index) => ({
        id: `media-${index + 1}`,
        label: item.label?.trim() || `Photo ${index + 1}`,
        url: normalizeGalleryUrl(item.url!),
        bg: PLACEHOLDER_PHOTOS[index % PLACEHOLDER_PHOTOS.length].bg,
      }));
  }

  if (Array.isArray(lot.images) && lot.images.length > 0) {
    return lot.images
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item, index) => ({
        id: `image-${index + 1}`,
        label: PLACEHOLDER_PHOTOS[index % PLACEHOLDER_PHOTOS.length].label,
        url: normalizeGalleryUrl(item),
        bg: PLACEHOLDER_PHOTOS[index % PLACEHOLDER_PHOTOS.length].bg,
      }));
  }

  return PLACEHOLDER_PHOTOS.map((photo) => ({
    ...photo,
    url: null,
  }));
}

function buildSpecRows(lot: LotDetail): SpecRow[] {
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

function buildUpcomingLots(lot: LotDetail): UpcomingLot[] {
  return lot.similar.slice(0, 3).map((item) => ({
    id: item.id,
    lotNumber: item.id.slice(0, 3).toUpperCase(),
    title: item.title,
    year: item.year,
    make: item.title.split(" ").at(1) ?? "",
    model: item.title.split(" ").slice(2).join(" ") || "",
    startingBid: item.currentBidAed,
  }));
}

function buildAuctionPlan(lot: LotDetail, upcomingLots: UpcomingLot[]): AuctionPlanItem[] {
  return upcomingLots.slice(0, 5).map((item, index) => ({
    index: index + 1,
    lotNumber: formatLotNumber(item.lotNumber),
    title: item.title || `${item.make} ${item.model}`.trim() || "Upcoming lot",
  }));
}

function Gallery({ lotKey, photos, title }: GalleryProps) {
  const [active, setActive] = useState(0);
  const [failedPhotoIds, setFailedPhotoIds] = useState<string[]>([]);

  useEffect(() => {
    setActive(0);
    setFailedPhotoIds([]);
  }, [lotKey]);

  const activePhoto = photos[active] ?? photos[0];
  const isPhotoBroken = (photo: GalleryPhoto): boolean => failedPhotoIds.includes(photo.id);

  if (!activePhoto) {
    return null;
  }

  return (
    <div className={styles.gallery}>
      <div className={styles.galleryFrame}>
        {activePhoto.url && !isPhotoBroken(activePhoto) ? (
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
            style={!photo.url || isPhotoBroken(photo) ? { background: photo.bg } : undefined}
          >
            {photo.url && !isPhotoBroken(photo) ? (
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

function SpecGrid({ specs }: SpecGridProps) {
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

function BidFeedItem({ entry, isNew }: BidFeedItemProps) {
  const [visible, setVisible] = useState(!isNew);

  useEffect(() => {
    if (!isNew) {
      setVisible(true);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, 20);

    return () => window.clearTimeout(timer);
  }, [isNew]);

  return (
    <div className={`${styles.feedItem} ${visible ? styles.feedItemVisible : ""}`}>
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

function FuseBidButton({
  onBid,
  nextAmount,
  bidStep,
  fuseProgress,
  fuseSeconds,
  isLeading,
  isLoading,
  disabled,
  expired,
  hasBids,
}: FuseBidButtonProps) {
  const hasTimer = hasBids && fuseProgress > 0;
  const urgent = fuseSeconds <= 5;
  const warning = fuseSeconds <= 10;
  const fuseColor = urgent ? "#ef4444" : warning ? "#f97316" : "#116a43";
  const fuseGlow = urgent ? "rgba(239,68,68,.5)" : warning ? "rgba(249,115,22,.4)" : "rgba(17,106,67,.35)";

  return (
    <div className={styles.fuseButtonShell}>
      <div
        className={`${styles.fuseTimerWrap} ${hasTimer ? styles.fuseTimerWrapActive : ""}`}
        style={
          {
            "--fuse-color": fuseColor,
            "--fuse-glow": fuseGlow,
          } as React.CSSProperties
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
        disabled={disabled || isLoading || expired}
        className={`${styles.bidButton} ${hasTimer ? styles.bidButtonWithTimer : styles.bidButtonIdle} ${isLeading ? styles.bidButtonLeading : ""}`}
        style={
          {
            "--fuse-color": fuseColor,
            "--fuse-progress": `${fuseProgress}%`,
          } as React.CSSProperties
        }
      >
        {!disabled && !isLoading ? <div className={styles.bidButtonShine} /> : null}
        {hasTimer ? <div className={styles.bidButtonFuseGlow} /> : null}

        <div className={styles.bidButtonInner}>
          <div className={styles.bidButtonMain}>
            {isLoading
              ? "Placing bid…"
              : disabled
                ? "Auction ended"
                : expired
                  ? "Going... Going... Gone!"
                  : isLeading
                    ? "✓ You're leading"
                    : "Place Bid"}
          </div>

          {!isLoading && !disabled && !expired && !isLeading ? (
            <div className={styles.bidButtonSub}>
              {formatAed(nextAmount)} · +{formatAed(bidStep)}
            </div>
          ) : null}

          {!isLoading && !disabled && !expired && isLeading ? (
            <div className={styles.bidButtonSubMuted}>next bid {formatAed(nextAmount)}</div>
          ) : null}
        </div>
      </button>

      {!hasBids ? (
        <div className={styles.fuseIdleLabel}>Place the first bid to start the timer</div>
      ) : null}
    </div>
  );
}

function WinnerOverlay({ lot, winner, heroImageUrl }: WinnerOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(true);
    }, 40);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={`${styles.winnerOverlay} ${visible ? styles.winnerOverlayVisible : ""}`}>
      {heroImageUrl ? (
        <div
          className={styles.winnerBackdrop}
          style={{ backgroundImage: `linear-gradient(rgba(247,249,251,0.66), rgba(247,249,251,0.95)), url(${heroImageUrl})` }}
        />
      ) : null}

      <div className={styles.winnerSurface}>
        <div className={styles.winnerIcon}>{winner.flag}</div>
        <div className={styles.winnerKicker}>{winner.kicker || `Lot ${formatLotNumber(lot.lotNumber)} — Sold`}</div>
        <div className={styles.winnerTitle}>{winner.title}</div>
        {winner.amount > 0 ? <div className={styles.winnerAmount}>{formatAed(winner.amount)}</div> : null}
        <div className={styles.winnerMeta}>{winner.label}</div>

        {winner.nextLot ? (
          <div className={styles.winnerNextLot}>
            <div className={styles.winnerNextLotLabel}>Up next</div>
            <div className={styles.winnerNextLotTitle}>
              LOT {formatLotNumber(winner.nextLot.lotNumber)} ·{" "}
              {winner.nextLot.year > 0 ? `${winner.nextLot.year} ` : ""}
              {winner.nextLot.title}
            </div>
          </div>
        ) : (
          <div className={styles.winnerNextLot}>
            <div className={styles.winnerNextLotLabel}>Session update</div>
            <div className={styles.winnerNextLotTitle}>No more lots remain in this live session.</div>
          </div>
        )}

        <div className={styles.winnerBarTrack}>
          <div className={styles.winnerBarFill} />
        </div>
        <div className={styles.winnerLoading}>
          {winner.nextLot ? "NEXT LOT LOADING…" : "CLOSING LIVE SESSION…"}
        </div>
      </div>
    </div>
  );
}

export function AuctionLiveRoom({ auctionId, initialSnapshot, lot }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { snapshot: liveSnapshot, connectionState } = useAuctionLiveSocket(auctionId);
  const snapshot = liveSnapshot ?? initialSnapshot;
  const [viewer, setViewer] = useState<ViewerState>(DEFAULT_VIEWER_STATE);
  const [auctionRemainingMs, setAuctionRemainingMs] = useState(() =>
    getRemainingMs(initialSnapshot.state === "SCHEDULED" ? initialSnapshot.startsAt : initialSnapshot.endsAt),
  );
  const [fuseProgress, setFuseProgress] = useState(() => (initialSnapshot.totalBids > 0 ? 100 : 0));
  const [fuseSeconds, setFuseSeconds] = useState(() => (initialSnapshot.totalBids > 0 ? FUSE_DURATION_SECONDS : 0));
  const [bidFeed, setBidFeed] = useState<BidFeedEntry[]>(() =>
    initialSnapshot.lastBid
      ? [
          createFeedEntry(
            initialSnapshot.lastBid.amount,
            Date.parse(initialSnapshot.lastBid.createdAt),
            initialSnapshot.lastBid.id,
            "snapshot",
            false,
            false,
          ),
        ]
      : [],
  );
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [lastProcessedBidId, setLastProcessedBidId] = useState(initialSnapshot.lastBid?.id ?? null);
  const [pulseCurrentBid, setPulseCurrentBid] = useState(false);
  const [winnerData, setWinnerData] = useState<WinnerData | null>(null);
  const [showWinnerOverlay, setShowWinnerOverlay] = useState(false);
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const fuseRef = useRef<number | null>(null);
  const winnerTimerRef = useRef<number | null>(null);
  const outcomeTriggerRef = useRef<string | null>(null);
  const previousStateRef = useRef(snapshot.state);

  const isLive = snapshot.state === "LIVE" || snapshot.state === "EXTENDED";
  const isScheduled = snapshot.state === "SCHEDULED";
  const nextBidAmount = useMemo(
    () => snapshot.currentPrice + snapshot.minIncrement,
    [snapshot.currentPrice, snapshot.minIncrement],
  );
  const photos = useMemo(() => buildGalleryPhotos(lot), [lot]);
  const primaryPhotoUrl = useMemo(() => photos.find((photo) => typeof photo.url === "string" && photo.url.length > 0)?.url ?? null, [photos]);
  const specs = useMemo(() => buildSpecRows(lot), [lot]);
  const upcomingLots = useMemo(() => buildUpcomingLots(lot), [lot]);
  const auctionPlan = useMemo(() => buildAuctionPlan(lot, upcomingLots), [lot, upcomingLots]);
  const hasBids = snapshot.totalBids > 0;
  const isFuseExpired = hasBids && fuseProgress <= 0 && fuseSeconds <= 0;
  const isLeading = bidFeed[0]?.isMine === true;
  const canBid =
    viewer.authenticated &&
    viewer.isBuyer &&
    isActiveStatus(viewer.userStatus) &&
    isActiveStatus(viewer.companyStatus) &&
    viewer.kycVerified &&
    viewer.hasRequiredDeposit;
  const sessionId = useMemo(() => formatSessionId(auctionId), [auctionId]);
  const locale = useMemo(() => getLocaleFromPathname(pathname), [pathname]);
  const lotProgressLabel = `1 / ${Math.max(1, upcomingLots.length + 1)}`;
  const viewerCountLabel = "--";
  const countdownParts = useMemo(() => formatCountdownParts(auctionRemainingMs), [auctionRemainingMs]);
  const summaryFacts = useMemo(
    () =>
      [
        lot.year > 0 ? String(lot.year) : null,
        lot.mileageKm > 0 ? `${lot.mileageKm.toLocaleString("en-AE")} km` : null,
      ].filter((fact): fact is string => fact !== null),
    [lot.mileageKm, lot.year],
  );
  const hasDamage = useMemo(
    () => lot.damageItems.length > 0 || (lot.damage.trim().length > 0 && lot.damage !== "None" && lot.damage !== "Not specified"),
    [lot.damage, lot.damageItems.length],
  );
  const damageSummary = useMemo(
    () => (lot.damageItems.length > 0 ? "Damage reported" : lot.damage),
    [lot.damage, lot.damageItems.length],
  );
  const specPills = useMemo(
    () =>
      [
        lot.regionSpec && lot.regionSpec !== "Not specified" ? `${lot.regionSpec} spec` : null,
        lot.fuelType && lot.fuelType !== "Not specified" ? lot.fuelType : null,
      ].filter((pill): pill is string => Boolean(pill && pill.trim())),
    [lot.fuelType, lot.regionSpec],
  );
  const roomMode = useMemo<RoomMode>(() => {
    if (transitionState === "nextLot") {
      return "NEXT_LOT";
    }

    if (transitionState === "sessionEnded") {
      return "SESSION_ENDED";
    }

    if (showWinnerOverlay && winnerData) {
      return winnerData.isMine ? "WON" : "SOLD_TO_OTHER";
    }

    if (isScheduled) {
      return "PRELIVE";
    }

    if (isLive) {
      if (!viewer.checked || !viewer.authenticated) {
        return "LIVE_GUEST";
      }

      if (!canBid) {
        return "LIVE_NO_DEPOSIT";
      }

      return "LIVE_READY";
    }

    return upcomingLots.length > 0 ? "NEXT_LOT" : "SESSION_ENDED";
  }, [canBid, isLive, isScheduled, showWinnerOverlay, transitionState, upcomingLots.length, viewer, winnerData]);
  const stateCard = useMemo(
    () => buildStateCardConfig(roomMode, viewer, auctionRemainingMs, nextBidAmount),
    [auctionRemainingMs, nextBidAmount, roomMode, viewer],
  );

  function triggerOutcome(variant: "won" | "sold" | "closed", reasonKey: string): void {
    if (outcomeTriggerRef.current === reasonKey) {
      return;
    }

    outcomeTriggerRef.current = reasonKey;

    const nextLot = upcomingLots[0] ?? null;

    setWinnerData({
      variant,
      amount: snapshot.currentPrice,
      flag: variant === "closed" ? "🕊️" : variant === "won" ? "🏆" : "🔨",
      isMine: variant === "won",
      title: variant === "closed" ? "Lot closed" : variant === "won" ? "You won this lot" : "Lot sold",
      kicker:
        variant === "closed"
          ? `Lot ${formatLotNumber(lot.lotNumber)} — Closed`
          : variant === "won"
            ? `Lot ${formatLotNumber(lot.lotNumber)} — Won`
            : `Lot ${formatLotNumber(lot.lotNumber)} — Sold`,
      label:
        variant === "closed"
          ? "This lot finished without a winning bid."
          : variant === "won"
            ? "Winning bid confirmed. Get ready for payment and the next lot."
            : "Another bidder secured this vehicle.",
      nextLot,
    });
    setShowWinnerOverlay(true);
    setTransitionState("idle");

    if (winnerTimerRef.current !== null) {
      window.clearTimeout(winnerTimerRef.current);
    }

    winnerTimerRef.current = window.setTimeout(() => {
      setShowWinnerOverlay(false);

      if (nextLot) {
        setTransitionState("nextLot");
        router.replace(withLocalePath(`/auctions/live/${nextLot.id}`, locale));
        return;
      }

      setTransitionState("sessionEnded");
    }, WINNER_MS);
  }

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlBackground = html.style.background;
    const previousBodyBackground = body.style.background;
    const chromeElements = Array.from(document.querySelectorAll("body > header, body > footer")).map((element) => ({
      element,
      display: element instanceof HTMLElement ? element.style.display : "",
    }));

    html.style.background = "#f7f9fb";
    body.style.background = "#f7f9fb";

    chromeElements.forEach(({ element }) => {
      if (element instanceof HTMLElement) {
        element.style.display = "none";
      }
    });

    return () => {
      html.style.background = previousHtmlBackground;
      body.style.background = previousBodyBackground;

      chromeElements.forEach(({ element, display }) => {
        if (element instanceof HTMLElement) {
          element.style.display = display;
        }
      });
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadViewer(): Promise<void> {
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

        try {
          const dashboard = await api.buyer.dashboard<BuyerDashboardResponse>({ cache: "no-store" });

          if (!active) {
            return;
          }

          setViewer({
            ...baseViewer,
            hasRequiredDeposit: dashboard.depositStatus?.hasRequiredDeposit === true,
            buyerTier: dashboard.vipStatus?.tier ?? baseViewer.buyerTier ?? "STANDARD",
          });
        } catch {
          if (active) {
            setViewer(baseViewer);
          }
        }
      } catch {
        if (active) {
          setViewer({
            ...DEFAULT_VIEWER_STATE,
            checked: true,
          });
        }
      }
    }

    void loadViewer();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const updateRemaining = () => {
      const targetIso = snapshot.state === "SCHEDULED" ? snapshot.startsAt : snapshot.endsAt;

      setAuctionRemainingMs(getRemainingMs(targetIso));
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1_000);

    return () => window.clearInterval(timer);
  }, [snapshot.endsAt, snapshot.startsAt, snapshot.state]);

  useEffect(() => {
    if (fuseRef.current !== null) {
      window.clearInterval(fuseRef.current);
      fuseRef.current = null;
    }

    if (snapshot.totalBids === 0) {
      setFuseProgress(0);
      setFuseSeconds(0);
      return undefined;
    }

    setFuseProgress(100);
    setFuseSeconds(FUSE_DURATION_SECONDS);

    const startedAt = Date.now();

    fuseRef.current = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1_000;
      const remainingSeconds = Math.max(0, FUSE_DURATION_SECONDS - elapsedSeconds);

      setFuseProgress((remainingSeconds / FUSE_DURATION_SECONDS) * 100);
      setFuseSeconds(Math.ceil(remainingSeconds));

      if (remainingSeconds === 0 && fuseRef.current !== null) {
        window.clearInterval(fuseRef.current);
        fuseRef.current = null;
      }
    }, FUSE_TICK_INTERVAL_MS);

    return () => {
      if (fuseRef.current !== null) {
        window.clearInterval(fuseRef.current);
        fuseRef.current = null;
      }
    };
  }, [snapshot.totalBids]);

  useEffect(() => {
    if (!inlineError) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setInlineError(null);
    }, 3_000);

    return () => window.clearTimeout(timer);
  }, [inlineError]);

  useEffect(() => {
    let active = true;

    const loadBidFeed = async () => {
      try {
        const payload = await api.ui.auctions.bids(auctionId, { limit: 40 }, { cache: "no-store" });

        if (!active || !Array.isArray(payload.bids)) {
          return;
        }

        setBidFeed((currentFeed) => {
          const currentTopId = currentFeed[0]?.id ?? null;
          const nextFeed = payload.bids
            .slice()
            .sort((left, right) => right.sequence_no - left.sequence_no)
            .map((entry, index) => {
              const normalized = normalizeBidFeedEntry(entry, index === 0 && entry.id !== currentTopId);

              return {
                ...normalized,
                isLeader: index === 0,
              };
            });

          return nextFeed.slice(0, 40);
        });
      } catch {
        // Keep the current live feed if history metadata cannot be loaded.
      }
    };

    void loadBidFeed();

    return () => {
      active = false;
    };
  }, [auctionId, snapshot.totalBids]);

  useEffect(() => {
    if (!snapshot.lastBid || snapshot.lastBid.id === lastProcessedBidId) {
      return;
    }

    const nextEntry = createFeedEntry(
      snapshot.lastBid.amount,
      Date.parse(snapshot.lastBid.createdAt),
      snapshot.lastBid.id,
      "snapshot",
      false,
      true,
      snapshot.lastBid.sequenceNo,
    );

    setBidFeed((currentFeed) => {
      if (currentFeed.some((entry) => entry.id === snapshot.lastBid?.id)) {
        return currentFeed;
      }

      const optimisticMatch = currentFeed.find(
        (entry) =>
          entry.source === "optimistic" &&
          entry.amount === nextEntry.amount &&
          Math.abs(entry.timestamp - nextEntry.timestamp) < 5_000,
      );

      if (optimisticMatch) {
        return currentFeed.map((entry) =>
          entry.id === optimisticMatch.id
            ? {
                ...nextEntry,
                isMine: optimisticMatch.isMine,
                isNew: true,
              }
            : {
                ...entry,
                isLeader: false,
                isNew: false,
              },
        );
      }

      return [nextEntry, ...currentFeed.map((entry) => ({ ...entry, isLeader: false, isNew: false }))].slice(0, 40);
    });

    setLastProcessedBidId(snapshot.lastBid.id);
    setPulseCurrentBid(true);

    const timer = window.setTimeout(() => {
      setPulseCurrentBid(false);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [lastProcessedBidId, snapshot.lastBid]);

  useEffect(() => {
    outcomeTriggerRef.current = null;
    setShowWinnerOverlay(false);
    setWinnerData(null);
    setTransitionState("idle");
  }, [auctionId]);

  useEffect(() => {
    const nextState = snapshot.state;
    const previousState = previousStateRef.current;
    const isWinnerState = nextState === "CLOSED" || nextState === "PAYMENT_PENDING";
    const wasWinnerState = previousState === "CLOSED" || previousState === "PAYMENT_PENDING";

    if (isWinnerState && !wasWinnerState) {
      if (snapshot.currentPrice <= 0) {
        triggerOutcome("closed", `backend-${auctionId}-closed`);
      } else {
        triggerOutcome(bidFeed[0]?.isMine === true ? "won" : "sold", `backend-${auctionId}-${snapshot.lastBid?.id ?? "closed"}`);
      }
    }

    previousStateRef.current = nextState;

    return () => {
      if (winnerTimerRef.current !== null) {
        window.clearTimeout(winnerTimerRef.current);
        winnerTimerRef.current = null;
      }
    };
  }, [auctionId, bidFeed, snapshot.currentPrice, snapshot.lastBid?.id, snapshot.state]);

  useEffect(() => {
    if (!isLive || !hasBids || !isFuseExpired || showWinnerOverlay) {
      return;
    }

    const timer = window.setTimeout(() => {
      const leadingEntry = bidFeed[0] ?? null;

      if (!leadingEntry) {
        triggerOutcome("closed", `fuse-${auctionId}-closed`);
        return;
      }

      triggerOutcome(leadingEntry.isMine ? "won" : "sold", `fuse-${auctionId}-${leadingEntry.id}`);
    }, 550);

    return () => window.clearTimeout(timer);
  }, [auctionId, bidFeed, hasBids, isFuseExpired, isLive, showWinnerOverlay]);

  const handleBid = async () => {
    if (!isLive || !canBid) {
      setInlineError("Live bidding is locked until your buyer access is fully ready.");
      return;
    }

    const idempotencyKey = createIdempotencyKey();
    const optimisticEntry = createFeedEntry(
      nextBidAmount,
      Date.now(),
      `optimistic-${idempotencyKey}`,
      "optimistic",
      true,
      true,
      snapshot.totalBids + 1,
    );

    setIsSubmittingBid(true);
    setInlineError(null);

    try {
      await api.bids.placeBid<{ id?: string }>(auctionId, nextBidAmount, idempotencyKey, {
        cache: "no-store",
      });

      setBidFeed((currentFeed) =>
        [optimisticEntry, ...currentFeed.map((entry) => ({ ...entry, isLeader: false, isNew: false }))].slice(0, 40),
      );
    } catch (error) {
      setInlineError(getApiErrorMessage(error, "Bid failed — please try again"));
    } finally {
      setIsSubmittingBid(false);
    }
  };

  return (
    <>
      {showWinnerOverlay && winnerData ? (
        <WinnerOverlay lot={lot} winner={winnerData} heroImageUrl={primaryPhotoUrl} />
      ) : null}

      <div className={styles.page} data-live-auction-room="true">
        <div className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <Link href="/" className={styles.brand} aria-label="FleetBid home">
              <span className={styles.brandMark}>FB</span>
              <span className={styles.brandText}>FleetBid</span>
            </Link>
            <div className={styles.topDivider} />
            <div className={styles.sessionId}>{sessionId}</div>
          </div>

          <div className={styles.topBarRight}>
            <div className={`${styles.livePill} ${getStatusClassName(snapshot.state)}`}>
              <span className={`${styles.connectionDot} ${getConnectionClassName(connectionState)}`} />
              <span>{getStatusLabel(snapshot.state)}</span>
            </div>

            <div className={styles.topMeta}>
              <IconEye size={11} strokeWidth={2} />
              <span>{viewerCountLabel}</span>
            </div>

            <div className={styles.topMeta}>{lotProgressLabel}</div>
          </div>
        </div>

        <div className={styles.bodyGrid}>
          <div className={styles.leftPane}>
            <div className={styles.lotHeader}>
              <div className={styles.lotHeaderRow}>
                <div className={styles.lotBadge}>LOT {formatLotNumber(lot.lotNumber)}</div>
              </div>

              <div className={styles.titleBar}>
                <div className={styles.titleLeft}>
                  <h1 className={styles.lotTitle}>{lot.title}</h1>

                  <div className={styles.quickMeta}>
                    <div className={styles.quickMetaFacts}>
                      {summaryFacts.map((fact, index) => (
                        <span key={`${fact}-${index}`}>
                          {index > 0 ? <span className={styles.metaDot}>·</span> : null}
                          <span>{fact}</span>
                        </span>
                      ))}
                      {hasDamage ? (
                        <span>
                          {summaryFacts.length > 0 ? <span className={styles.metaDot}>·</span> : null}
                          <span className={styles.damage}>{damageSummary}</span>
                        </span>
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
            </div>

            <div className={styles.heroRow}>
              <div className={styles.leftColumn}>
                <Gallery lotKey={lot.id} photos={photos} title={lot.title} />

                <div className={styles.block}>
                  <div className={styles.blockLabel}>Vehicle Details</div>
                  <SpecGrid specs={specs} />
                </div>
              </div>

              <div className={styles.rightPane}>
                <div className={styles.currentBidSection}>
                  <div className={styles.sectionKicker}>{isScheduled ? "Starting Bid" : "Current Bid"}</div>
                  <div className={`${styles.currentBidValue} ${pulseCurrentBid ? styles.currentBidValuePulse : ""}`}>
                    {formatAed((isScheduled && snapshot.currentPrice === 0 ? snapshot.startingPrice : snapshot.currentPrice) || 0)}
                  </div>

                  <div className={styles.statsRow}>
                    <div className={styles.statItem}>
                      <div className={styles.statLabel}>BIDS</div>
                      <div className={styles.statValue}>{snapshot.totalBids}</div>
                    </div>

                    <div className={styles.statItem}>
                      <div className={styles.statLabel}>STEP</div>
                      <div className={`${styles.statValue} ${styles.statValueAccent}`}>
                        +{formatAed(snapshot.minIncrement)}
                      </div>
                    </div>

                    <div className={styles.statItem}>
                      <div className={styles.statLabel}>STARTED</div>
                      <div className={styles.statValue}>{formatAed(snapshot.startingPrice)}</div>
                    </div>
                  </div>
                </div>

                <div className={styles.bidPanel}>
                  {stateCard && (roomMode === "PRELIVE" || roomMode === "LIVE_GUEST" || roomMode === "LIVE_NO_DEPOSIT") ? (
                    <div
                      className={`${styles.stateCard} ${
                        stateCard.tone === "live"
                          ? styles.stateCardLive
                          : stateCard.tone === "warning"
                            ? styles.stateCardWarning
                            : stateCard.tone === "success"
                              ? styles.stateCardSuccess
                              : stateCard.tone === "muted"
                                ? styles.stateCardMuted
                                : ""
                      }`}
                    >
                      <div className={styles.stateCardEyebrow}>{stateCard.eyebrow}</div>
                      <div className={styles.stateCardTitle}>{stateCard.title}</div>
                      <p className={styles.stateCardBody}>{stateCard.body}</p>
                      {stateCard.actionHref && stateCard.actionLabel ? (
                        <Link href={stateCard.actionHref} className={styles.stateCardAction}>
                          {stateCard.actionLabel}
                        </Link>
                      ) : null}
                    </div>
                  ) : null}

                  {roomMode === "LIVE_READY" ? (
                    <FuseBidButton
                      onBid={() => void handleBid()}
                      nextAmount={nextBidAmount}
                      bidStep={snapshot.minIncrement}
                      fuseProgress={fuseProgress}
                      fuseSeconds={fuseSeconds}
                      isLeading={isLeading}
                      isLoading={isSubmittingBid}
                      disabled={!isLive || !canBid}
                      expired={isFuseExpired}
                      hasBids={hasBids}
                    />
                  ) : null}

                  {inlineError ? <div className={styles.inlineError}>{inlineError}</div> : null}
                </div>

                {roomMode === "PRELIVE" ? (
                  <div className={styles.prelivePanel}>
                    <div className={styles.preliveHero}>
                      <div className={styles.preliveEyebrow}>Coming soon room</div>
                      <div className={styles.preliveTitle}>Auction goes live shortly</div>
                      <p className={styles.preliveBody}>
                        Watch the countdown, review the lot order, and stay ready for the opening bid. The room will
                        switch into live bidding automatically.
                      </p>
                    </div>

                    <div className={styles.preliveCountdown}>
                      <div className={styles.preliveTimeCard}>
                        <span className={styles.preliveTimeValue}>{countdownParts.hours}</span>
                        <span className={styles.preliveTimeLabel}>hours</span>
                      </div>
                      <div className={styles.preliveTimeCard}>
                        <span className={styles.preliveTimeValue}>{countdownParts.minutes}</span>
                        <span className={styles.preliveTimeLabel}>minutes</span>
                      </div>
                      <div className={styles.preliveTimeCard}>
                        <span className={styles.preliveTimeValue}>{countdownParts.seconds}</span>
                        <span className={styles.preliveTimeLabel}>seconds</span>
                      </div>
                    </div>

                    <div className={styles.preliveChecklist}>
                      <div className={styles.preliveChecklistItem}>Review the vehicle and damage details before launch</div>
                      <div className={styles.preliveChecklistItem}>Make sure your buyer account and deposit are ready</div>
                      <div className={styles.preliveChecklistItem}>Stay in this tab to move straight into live bidding</div>
                    </div>
                  </div>
                ) : roomMode === "NEXT_LOT" ? (
                  <div className={styles.outcomePanel}>
                    <div className={styles.outcomePanelEyebrow}>Next lot</div>
                    <div className={styles.outcomePanelTitle}>The session is moving forward</div>
                    <p className={styles.outcomePanelBody}>
                      This lot is complete. Stay in the room and get ready for the next vehicle in the auction order.
                    </p>

                    {upcomingLots[0] ? (
                      <div className={styles.nextLotCard}>
                        <div className={styles.nextLotLabel}>UP NEXT</div>
                        <div className={styles.nextLotTitle}>
                          LOT {formatLotNumber(upcomingLots[0].lotNumber)} ·{" "}
                          {upcomingLots[0].year > 0 ? `${upcomingLots[0].year} ` : ""}
                          {upcomingLots[0].title}
                        </div>
                        <div className={styles.nextLotMeta}>Starting from {formatAed(upcomingLots[0].startingBid)}</div>
                      </div>
                    ) : null}
                  </div>
                ) : roomMode === "SESSION_ENDED" ? (
                  <div className={styles.outcomePanel}>
                    <div className={styles.outcomePanelEyebrow}>Auction closed</div>
                    <div className={styles.outcomePanelTitle}>Thank you for participating</div>
                    <p className={styles.outcomePanelBody}>
                      This live session has ended. You can return to the marketplace, review your dashboard, or join the
                      next auction lineup.
                    </p>

                    <div className={styles.sessionEndedActions}>
                      <Link href="/auctions" className={styles.stateCardAction}>
                        Browse upcoming auctions
                      </Link>
                      <Link href="/dashboard" className={styles.secondaryAction}>
                        Open dashboard
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className={styles.feedSection}>
                    <div className={styles.feedHeader}>
                      <div className={styles.sectionKicker}>Live Bids</div>
                      <div className={styles.feedHeaderMeta}>
                        <IconUsers size={12} strokeWidth={2} />
                        <span>{snapshot.totalBids} total</span>
                      </div>
                    </div>

                    <div className={styles.feedScroller}>
                      {bidFeed.length === 0 ? (
                        <div className={styles.feedEmpty}>No bids yet — be the first</div>
                      ) : (
                        bidFeed.map((entry, index) => (
                          <BidFeedItem key={entry.id} entry={entry} isNew={index === 0 && entry.isNew} />
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className={styles.footerMeta}>
                  <div className={styles.footerMetaItem}>
                    <IconClock size={12} strokeWidth={2} />
                    <span>{formatRemainingTime(auctionRemainingMs)}</span>
                  </div>
                  <div className={styles.footerMetaItem}>
                    <IconTag size={12} strokeWidth={2} />
                    <span>{snapshot.state}</span>
                  </div>
                  <div className={styles.footerMetaItem}>
                    <IconZap size={12} strokeWidth={2} />
                    <span>WS {connectionState}</span>
                  </div>
                </div>

                <div className={styles.planSection}>
                  <div className={styles.sectionKicker}>Auction Plan</div>
                  {auctionPlan.length > 0 ? (
                    <div className={styles.planTrack}>
                      {auctionPlan.map((item) => (
                        <div key={`${item.index}-${item.lotNumber}`} className={styles.planStep}>
                          <div className={styles.planIndex}>{item.index}</div>
                          <div className={styles.planContent}>
                            <div className={styles.planLot}>LOT {item.lotNumber}</div>
                            <div className={styles.planTitle}>{item.title}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.planEmpty}>No upcoming lots in this session yet</div>
                  )}
                </div>
              </div>
            </div>

            {upcomingLots.length > 0 ? (
              <div className={styles.block}>
                <div className={styles.blockLabel}>Next Lots</div>
                <div className={styles.upcomingGrid}>
                  {upcomingLots.map((item) => (
                    <div key={item.id} className={styles.upcomingCard}>
                      <div className={styles.upcomingLotLabel}>LOT {item.lotNumber}</div>
                      <div className={styles.upcomingTitle}>
                        {item.year > 0 ? `${item.year} ` : ""}
                        {item.title || `${item.make} ${item.model}`.trim()}
                      </div>
                      <div className={styles.upcomingPrice}>from {formatAed(item.startingBid)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
