"use client";

import { useEffect, useMemo, useState } from "react";

import type { EventLotView } from "@/src/lib/event-live-lot";
import { mapAuctionPayloadToEventLotView } from "@/src/lib/event-live-lot";
import {
  type EventResultEntry,
  type UiAuctionBidHistoryEntry,
  api,
} from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";
import type { EventRuntime } from "@/src/types/auction";

import styles from "./page.module.css";

const NORMAL_CALL_DURATION_MS = 20_000;
const LAST_CHANCE_DURATION_MS = 10_000;

type EventConsoleClientProps = {
  eventId: string;
  eventTitle: string;
  initialRuntime: EventRuntime;
  initialResults: EventResultEntry[];
  initialLot: EventLotView | null;
  initialLeader: UiAuctionBidHistoryEntry | null;
};

function getCallRoundLabel(callRound: number): string {
  if (callRound === 2) {
    return "Last Chance 2";
  }

  if (callRound === 1) {
    return "Last Chance 1";
  }

  return "Normal";
}

function getCallRoundClassName(callRound: number): string {
  if (callRound === 2) {
    return styles.callRoundRed;
  }

  if (callRound === 1) {
    return styles.callRoundOrange;
  }

  return styles.callRoundGreen;
}

function formatRelativeEnd(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function loadCurrentLotState(
  auctionId: string,
): Promise<{ lot: EventLotView | null; leader: UiAuctionBidHistoryEntry | null }> {
  const [auctionPayload, bidPayload] = await Promise.all([
    api.auctions.get<Record<string, unknown>>(auctionId),
    api.ui.auctions.bids(auctionId, { limit: 1 }),
  ]);

  return {
    lot: mapAuctionPayloadToEventLotView(auctionPayload, auctionId),
    leader: bidPayload.bids[0] ?? null,
  };
}

export function EventConsoleClient({
  eventId,
  eventTitle,
  initialRuntime,
  initialResults,
  initialLot,
  initialLeader,
}: EventConsoleClientProps) {
  const [runtime, setRuntime] = useState(initialRuntime);
  const [results, setResults] = useState(initialResults);
  const [lot, setLot] = useState<EventLotView | null>(initialLot);
  const [leader, setLeader] = useState<UiAuctionBidHistoryEntry | null>(initialLeader);
  const [pollError, setPollError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const [nextRuntime, nextResults] = await Promise.all([
          api.admin.events.getEventConsole(eventId),
          api.admin.events.getEventResults(eventId),
        ]);

        if (cancelled) {
          return;
        }

        setRuntime(nextRuntime);
        setResults(nextResults);
        setPollError(null);

        if (!nextRuntime.currentLot) {
          setLot(null);
          setLeader(null);
          return;
        }

        const currentLotState = await loadCurrentLotState(nextRuntime.currentLot.auctionId);

        if (cancelled) {
          return;
        }

        setLot(currentLotState.lot);
        setLeader(currentLotState.leader);
      } catch (error) {
        if (!cancelled) {
          setPollError(error instanceof Error ? error.message : "Unable to refresh the event console.");
        }
      }
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, 2_000);

    void refresh();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [eventId]);

  useEffect(() => {
    if (!runtime.currentLot?.callEndsAt) {
      setRemainingMs(0);
      return;
    }

    const durationMs = runtime.currentLot.callRound === 0 ? NORMAL_CALL_DURATION_MS : LAST_CHANCE_DURATION_MS;
    const target = Date.parse(runtime.currentLot.callEndsAt);
    const start = Math.max(0, target - durationMs);

    const update = () => {
      const now = Date.now();
      const remaining = Math.max(0, target - now);
      const elapsed = Math.max(0, now - start);

      setRemainingMs(Math.max(0, durationMs - elapsed));

      if (remaining <= 0) {
        setRemainingMs(0);
      }
    };

    update();
    const timer = window.setInterval(update, 100);

    return () => {
      window.clearInterval(timer);
    };
  }, [runtime.currentLot?.callEndsAt, runtime.currentLot?.callRound]);

  const soldCount = useMemo(
    () => results.filter((result) => result.status === "SOLD" || result.status === "SOLD_DEFAULTED").length,
    [results],
  );
  const unsoldCount = useMemo(
    () => results.filter((result) => result.status === "UNSOLD").length,
    [results],
  );
  const completedLots = useMemo(
    () => results.filter((result) => result.status !== "QUEUED" && result.status !== "ON_BLOCK"),
    [results],
  );
  const remainingLots = Math.max(0, runtime.totalLots - completedLots.length);
  const currentPosition = runtime.currentLot?.position ?? -1;
  const currentBid = runtime.currentLot?.snapshot.currentPrice ?? 0;
  const currentBidCount = runtime.currentLot?.snapshot.totalBids ?? 0;
  const durationMs = runtime.currentLot?.callRound === 0 ? NORMAL_CALL_DURATION_MS : LAST_CHANCE_DURATION_MS;
  const fuseProgress = durationMs > 0 ? Math.max(0, Math.min(100, (remainingMs / durationMs) * 100)) : 0;

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.heading}>{eventTitle}</h1>
          <p className={styles.metaLine}>
            {runtime.state === "LIVE" ? "Live event console" : "Event runtime"} · Lot {Math.max(1, currentPosition + 1)} of{" "}
            {Math.max(1, runtime.totalLots)}
          </p>
        </div>
      </div>

      {pollError ? <p className={styles.errorText}>{pollError}</p> : null}

      <div className={styles.consoleGrid}>
        <section className={styles.consoleCard}>
          <div className={styles.sectionTitle}>Current Lot on Block</div>
          {lot && runtime.currentLot ? (
            <div className={styles.consoleBody}>
              <div className={styles.currentLotHeader}>
                <div>
                  <h2 className={styles.cardTitle}>
                    {lot.make} {lot.model} {lot.year}
                  </h2>
                  <p className={styles.metaLine}>Auction ID {runtime.currentLot.auctionId.slice(0, 8).toUpperCase()}</p>
                </div>
                <span className={`${styles.statusBadge} ${getCallRoundClassName(runtime.currentLot.callRound)}`}>
                  {getCallRoundLabel(runtime.currentLot.callRound)}
                </span>
              </div>

              {lot.images[0] ? (
                <img src={lot.images[0]} alt={lot.title} className={styles.consoleImage} />
              ) : (
                <div className={styles.consolePlaceholder}>No photo available</div>
              )}

              <div className={styles.metricGrid}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Current bid</span>
                  <strong className={styles.metricValue}>{formatAed(currentBid)}</strong>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Bid count</span>
                  <strong className={styles.metricValue}>{currentBidCount}</strong>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Leader</span>
                  <strong className={styles.metricValueSmall}>{leader?.company_name ?? "No bids yet"}</strong>
                </div>
              </div>

              <div className={styles.fuseWrap}>
                <div className={styles.fuseMeta}>
                  <span>Call window</span>
                  <strong>{formatRelativeEnd(remainingMs)}</strong>
                </div>
                <div className={styles.fuseTrack}>
                  <div className={styles.fuseFill} style={{ width: `${fuseProgress}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyStateCard}>No lot is currently on block.</div>
          )}
        </section>

        <section className={styles.consoleCard}>
          <div className={styles.sectionTitle}>Queue</div>
          <div className={styles.consoleBody}>
            <details className={styles.queueDetails}>
              <summary className={styles.queueSummary}>Completed lots ({completedLots.length})</summary>
              <div className={styles.queueList}>
                {completedLots.length === 0 ? (
                  <div className={styles.queueRowMuted}>No completed lots yet.</div>
                ) : (
                  completedLots.map((result) => (
                    <div key={result.lotId} className={styles.queueRow}>
                      <div>
                        <span className={styles.queueIndex}>#{result.position + 1}</span>
                        <strong>{result.vehicle}</strong>
                      </div>
                      <div className={styles.queueOutcome}>
                        <span
                          className={`${styles.statusBadge} ${
                            result.status === "UNSOLD" ? styles.statusMuted : styles.statusSuccess
                          }`}
                        >
                          {result.status === "UNSOLD" ? "UNSOLD" : "SOLD"}
                        </span>
                        <span>{formatAed(result.winningBid)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>

            <div className={styles.queueSection}>
              <div className={styles.queueSectionLabel}>Current lot</div>
              <div className={`${styles.queueRow} ${styles.queueCurrent}`}>
                <div>
                  <span className={styles.queueIndex}>#{currentPosition + 1}</span>
                  <strong>{lot?.title ?? "Waiting for first lot"}</strong>
                </div>
                <span className={`${styles.statusBadge} ${styles.statusLive}`}>ON BLOCK</span>
              </div>
            </div>

            <div className={styles.queueSection}>
              <div className={styles.queueSectionLabel}>Upcoming lots</div>
              <div className={styles.queueList}>
                {runtime.upcomingLots.length === 0 ? (
                  <div className={styles.queueRowMuted}>No queued lots remaining.</div>
                ) : (
                  runtime.upcomingLots.map((upcoming) => (
                    <div key={`${upcoming.position}-${upcoming.auctionId}`} className={styles.queueRow}>
                      <div>
                        <span className={styles.queueIndex}>#{upcoming.position + 1}</span>
                        <strong>{upcoming.title}</strong>
                      </div>
                      <span className={`${styles.statusBadge} ${styles.statusScheduled}`}>QUEUED</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.consoleFooter}>
        <span>Total lots: {runtime.totalLots}</span>
        <span>Sold: {soldCount}</span>
        <span>Unsold: {unsoldCount}</span>
        <span>Remaining: {remainingLots}</span>
      </div>
    </section>
  );
}
