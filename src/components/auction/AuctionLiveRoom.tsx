"use client";

import { useEffect, useMemo, useState } from "react";

import { IconCar, IconClock, IconMapPin, IconTag, IconUsers, IconZap } from "@/components/ui/icons";
import { useAuctionLiveSocket } from "@/src/hooks/useAuctionLiveSocket";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";
import type { AuctionLiveSnapshot } from "@/src/types/auction";
import type { LotDetail } from "@/app/auctions/[auctionId]/page";

import styles from "./AuctionLiveRoom.module.css";

type BidFeedEntry = {
  id: string;
  amount: number;
  timestamp: number;
  isLeader: boolean;
  isOwn: boolean;
  source: "snapshot" | "optimistic";
};

type Props = {
  auctionId: string;
  initialSnapshot: AuctionLiveSnapshot;
  lot: LotDetail;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function createFeedEntry(
  amount: number,
  timestamp: number,
  id: string,
  source: "snapshot" | "optimistic",
  isOwn = false,
): BidFeedEntry {
  return {
    id,
    amount,
    timestamp,
    isLeader: true,
    isOwn,
    source,
  };
}

function buildSpecRows(lot: LotDetail): Array<{ label: string; value: string }> {
  const rows = [
    { label: "Year", value: String(lot.year || "—") },
    { label: "Mileage", value: lot.mileageKm > 0 ? `${lot.mileageKm.toLocaleString("en-AE")} km` : "—" },
    { label: "Region", value: lot.regionSpec || "—" },
    { label: "Fuel", value: lot.fuelType || "—" },
    { label: "Transmission", value: lot.transmission || "—" },
    { label: "Body", value: lot.bodyStyle || "—" },
    { label: "Color", value: lot.color || "—" },
    { label: "Condition", value: lot.condition || "—" },
  ];

  return rows;
}

export function AuctionLiveRoom({ auctionId, initialSnapshot, lot }: Props) {
  const { snapshot: liveSnapshot, connectionState } = useAuctionLiveSocket(auctionId);
  const snapshot = liveSnapshot ?? initialSnapshot;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(initialSnapshot.endsAt));
  const [fuseWindowMs, setFuseWindowMs] = useState(() => Math.max(getRemainingMs(initialSnapshot.endsAt), 1));
  const [bidFeed, setBidFeed] = useState<BidFeedEntry[]>(() =>
    initialSnapshot.lastBid
      ? [
          createFeedEntry(
            initialSnapshot.lastBid.amount,
            Date.parse(initialSnapshot.lastBid.createdAt),
            initialSnapshot.lastBid.id,
            "snapshot",
          ),
        ]
      : [],
  );
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [lastProcessedBidId, setLastProcessedBidId] = useState(initialSnapshot.lastBid?.id ?? null);

  const isLive = snapshot.state === "LIVE" || snapshot.state === "EXTENDED";
  const hasMultipleImages = lot.images.length > 1;
  const nextBidAmount = useMemo(
    () => snapshot.currentPrice + snapshot.minIncrement,
    [snapshot.currentPrice, snapshot.minIncrement],
  );
  const specRows = useMemo(() => buildSpecRows(lot), [lot]);
  const fuseProgress = Math.max(0, Math.min(100, (remainingMs / Math.max(fuseWindowMs, 1)) * 100));

  useEffect(() => {
    setActiveImageIndex(0);
  }, [lot.auctionId]);

  useEffect(() => {
    const updateRemaining = () => {
      setRemainingMs(getRemainingMs(snapshot.endsAt));
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1_000);

    return () => window.clearInterval(timer);
  }, [snapshot.endsAt]);

  useEffect(() => {
    setFuseWindowMs(Math.max(getRemainingMs(snapshot.endsAt), 1));
  }, [snapshot.endsAt]);

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
    if (!snapshot.lastBid || snapshot.lastBid.id === lastProcessedBidId) {
      return;
    }

    const nextEntry = createFeedEntry(
      snapshot.lastBid.amount,
      Date.parse(snapshot.lastBid.createdAt),
      snapshot.lastBid.id,
      "snapshot",
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
                isOwn: optimisticMatch.isOwn,
              }
            : {
                ...entry,
                isLeader: false,
              },
        );
      }

      return [nextEntry, ...currentFeed.map((entry) => ({ ...entry, isLeader: false }))].slice(0, 40);
    });

    setLastProcessedBidId(snapshot.lastBid.id);
  }, [lastProcessedBidId, snapshot.lastBid]);

  const handleBid = async () => {
    const idempotencyKey = createIdempotencyKey();
    const optimisticEntry = createFeedEntry(
      nextBidAmount,
      Date.now(),
      `optimistic-${idempotencyKey}`,
      "optimistic",
      true,
    );

    setIsSubmittingBid(true);
    setInlineError(null);

    try {
      await api.bids.placeBid<{ id?: string }>(auctionId, nextBidAmount, idempotencyKey, {
        cache: "no-store",
      });

      setBidFeed((currentFeed) =>
        [optimisticEntry, ...currentFeed.map((entry) => ({ ...entry, isLeader: false }))].slice(0, 40),
      );
    } catch (error) {
      setInlineError(getApiErrorMessage(error, "Bid failed — please try again"));
    } finally {
      setIsSubmittingBid(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topBarMain}>
          <span className={styles.kicker}>FleetBid Live Room</span>
          <h1 className={styles.title}>
            {lot.year} {lot.make} {lot.model}
          </h1>
          <p className={styles.subtitle}>
            Lot #{lot.lotNumber} • {lot.location}
          </p>
        </div>
        <div className={styles.topBarStatus}>
          <span className={styles.liveBadge}>
            <span className={`${styles.connectionDot} ${getConnectionClassName(connectionState)}`} />
            {snapshot.state}
          </span>
          <span className={styles.metaChip}>
            <IconClock size={14} strokeWidth={2.1} />
            {formatRemainingTime(remainingMs)}
          </span>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.gallerySection}>
          <div className={styles.galleryMain}>
            {lot.images[activeImageIndex] ? (
              <img
                src={lot.images[activeImageIndex]}
                alt={`${lot.title} image ${activeImageIndex + 1}`}
                className={styles.galleryImage}
              />
            ) : (
              <div className={styles.galleryFallback}>
                <IconCar size={40} strokeWidth={1.8} />
                <span>No image</span>
              </div>
            )}
            <span className={styles.galleryCounter}>
              {Math.min(activeImageIndex + 1, lot.images.length)} / {lot.images.length || 1}
            </span>
          </div>
          {hasMultipleImages ? (
            <div className={styles.thumbnailRow}>
              {lot.images.slice(0, 8).map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={`${styles.thumbnailButton} ${index === activeImageIndex ? styles.thumbnailActive : ""}`}
                  onClick={() => setActiveImageIndex(index)}
                >
                  <img src={image} alt={`Thumbnail ${index + 1}`} className={styles.thumbnailImage} />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.detailsSection}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2>Vehicle Specs</h2>
              <span className={styles.headerMeta}>
                <IconMapPin size={14} strokeWidth={2} />
                {lot.location}
              </span>
            </div>
            <div className={styles.specGrid}>
              {specRows.map((row) => (
                <div key={row.label} className={styles.specCard}>
                  <span className={styles.specLabel}>{row.label}</span>
                  <span className={styles.specValue}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className={styles.descriptionBlock}>
              <span className={styles.specLabel}>Description</span>
              <p>{lot.description}</p>
            </div>
          </div>
        </section>

        <aside className={styles.panelSection}>
          <div className={styles.bidCard}>
            <div className={styles.bidCardHeader}>
              <div>
                <span className={styles.bidEyebrow}>Live Bidding</span>
                <p className={styles.bidPrice}>{formatAed(snapshot.currentPrice)}</p>
              </div>
              <div className={styles.bidStats}>
                <span className={styles.metaChip}>
                  <IconTag size={14} strokeWidth={2} />
                  Step {formatAed(snapshot.minIncrement)}
                </span>
                <span className={styles.metaChip}>
                  <IconUsers size={14} strokeWidth={2} />
                  {snapshot.totalBids} bids
                </span>
                <span className={styles.metaChip}>Start {formatAed(snapshot.startingPrice)}</span>
              </div>
            </div>

            <div className={styles.fuseWrap}>
              <div className={styles.fuseBar}>
                <div
                  className={styles.fuseFill}
                  style={{
                    width: snapshot.endsAt ? `${fuseProgress}%` : "0%",
                  }}
                />
              </div>
              <button
                type="button"
                className={styles.bidButton}
                disabled={!isLive || isSubmittingBid}
                onClick={() => void handleBid()}
              >
                <span className={styles.bidButtonMain}>
                  <IconZap size={16} strokeWidth={2.2} />
                  {isSubmittingBid ? "Placing bid..." : `Bid ${formatAed(nextBidAmount)}`}
                </span>
              </button>
            </div>

            {inlineError ? <p className={styles.inlineError}>{inlineError}</p> : null}

            <div className={styles.feedSection}>
              <div className={styles.sectionHeader}>
                <h3>Bid Feed</h3>
                <span className={styles.headerMeta}>
                  <IconClock size={14} strokeWidth={2} />
                  {connectionState}
                </span>
              </div>
              <div className={styles.feedList}>
                {bidFeed.length > 0 ? (
                  bidFeed.map((entry) => (
                    <div key={entry.id} className={`${styles.feedRow} ${entry.isOwn ? styles.feedRowOwn : ""}`}>
                      <div className={styles.feedMeta}>
                        <span className={styles.feedAmount}>{formatAed(entry.amount)}</span>
                        <span className={styles.feedTimestamp}>
                          {new Date(entry.timestamp).toLocaleTimeString("en-AE", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                      <span className={`${styles.feedBadge} ${entry.isLeader ? styles.feedBadgeLeader : ""}`}>
                        {entry.isOwn ? "You" : "Market"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className={styles.feedEmpty}>No bids yet — first accepted update will appear here.</div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {!isLive ? (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <span className={styles.overlayEyebrow}>Auction not live</span>
            <strong>{snapshot.state}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
