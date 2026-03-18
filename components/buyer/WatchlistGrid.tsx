"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { IconCalendar, IconClock, IconHeart } from "@/components/ui/icons";
import { api } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./WatchlistGrid.module.css";

type WatchlistLot = {
  id: string;
  state: string;
  currentPrice: number;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  isWatchlisted: boolean;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    images: string[];
  };
};

type WatchlistGridProps = {
  initialLots: WatchlistLot[];
};

type FilterKey = "ALL" | "LIVE" | "SCHEDULED" | "ENDING_SOON";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "LIVE", label: "Live" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "ENDING_SOON", label: "Ending soon" },
];

function normalizeStatus(value: string): string {
  return value.trim().toUpperCase();
}

function formatTimingLabel(lot: WatchlistLot): string {
  const normalizedStatus = normalizeStatus(lot.state);
  const target = normalizedStatus === "LIVE" || normalizedStatus === "EXTENDED" ? lot.endsAt : lot.startsAt;

  if (!target) {
    return "Time unavailable";
  }

  const timeValue = new Date(target).getTime();
  const diffMs = timeValue - Date.now();

  if (diffMs <= 0) {
    return normalizedStatus === "LIVE" || normalizedStatus === "EXTENDED" ? "Closing soon" : "Opening soon";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h left`;
  }

  return `${Math.max(totalMinutes, 1)}m left`;
}

function formatTitle(lot: WatchlistLot): string {
  return `${lot.vehicle.brand} ${lot.vehicle.model} ${lot.vehicle.year}`;
}

export function WatchlistGrid({ initialLots }: WatchlistGridProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("ALL");
  const [lots, setLots] = useState(initialLots);
  const [busyLotId, setBusyLotId] = useState<string | null>(null);

  const filteredLots = useMemo(() => {
    if (activeFilter === "ALL") {
      return lots;
    }

    if (activeFilter === "LIVE") {
      return lots.filter((lot) => {
        const status = normalizeStatus(lot.state);
        return status === "LIVE" || status === "EXTENDED";
      });
    }

    if (activeFilter === "SCHEDULED") {
      return lots.filter((lot) => normalizeStatus(lot.state) === "SCHEDULED");
    }

    const now = Date.now();
    const nextDay = now + 24 * 60 * 60 * 1000;

    return lots.filter((lot) => {
      const endAt = lot.endsAt ? new Date(lot.endsAt).getTime() : null;
      return endAt !== null && endAt >= now && endAt <= nextDay;
    });
  }, [activeFilter, lots]);

  async function handleToggle(lotId: string): Promise<void> {
    const nextLots = lots.filter((lot) => lot.id !== lotId);
    const previousLots = lots;

    setLots(nextLots);
    setBusyLotId(lotId);

    try {
      await api.buyer.wishlist.toggle<{ watchlisted: boolean }>(lotId);
    } catch {
      setLots(previousLots);
    } finally {
      setBusyLotId(null);
    }
  }

  if (lots.length === 0) {
    return (
      <section className={styles.emptyState}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <IconHeart size={24} strokeWidth={2} />
        </span>
        <h2>Your watchlist is empty</h2>
        <p>Tap the heart icon on any lot to save it here.</p>
        <Link href="/auctions" className="btn btn-primary">
          Browse auctions
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.filterRow}>
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`${styles.filterChip} ${activeFilter === filter.key ? styles.filterChipActive : ""}`}
            onClick={() => setActiveFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredLots.length === 0 ? (
        <section className={styles.emptyState}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconHeart size={24} strokeWidth={2} />
          </span>
          <h2>No lots in this filter</h2>
          <p>Try another filter or browse auctions to add more lots.</p>
          <Link href="/auctions" className="btn btn-primary">
            Browse auctions
          </Link>
        </section>
      ) : (
        <div className={styles.grid}>
          {filteredLots.map((lot) => {
            const status = normalizeStatus(lot.state);
            const imageUrl = lot.vehicle.images[0] || "/vehicle-photo.svg";
            const title = formatTitle(lot);

            return (
              <article key={lot.id} className={styles.card}>
                <button
                  type="button"
                  className={`${styles.heartButton} ${busyLotId === lot.id ? styles.heartButtonBusy : ""}`}
                  onClick={() => void handleToggle(lot.id)}
                  disabled={busyLotId === lot.id}
                  aria-label="Remove from watchlist"
                >
                  <IconHeart size={18} strokeWidth={2} />
                </button>

                <Link href={`/auctions/${lot.id}`} className={styles.cardLink}>
                  <div className={styles.imageWrap}>
                    <Image src={imageUrl} alt={title} fill sizes="(max-width: 980px) 100vw, 50vw" className={styles.image} />
                    <span
                      className={`${styles.statusBadge} ${
                        status === "LIVE" || status === "EXTENDED" ? styles.statusLive : styles.statusScheduled
                      }`}
                    >
                      {status === "LIVE" || status === "EXTENDED" ? "LIVE" : "Scheduled"}
                    </span>
                  </div>

                  <div className={styles.cardBody}>
                    <h3>{title}</h3>
                    <strong className={styles.price}>{formatAed(lot.currentPrice)}</strong>

                    <div className={styles.meta}>
                      <span>{lot.location}</span>
                      <span className={styles.metaDivider}>·</span>
                      <span className={styles.metaTime}>
                        {status === "LIVE" || status === "EXTENDED" ? (
                          <IconClock size={14} strokeWidth={2} />
                        ) : (
                          <IconCalendar size={14} strokeWidth={2} />
                        )}
                        {formatTimingLabel(lot)}
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
