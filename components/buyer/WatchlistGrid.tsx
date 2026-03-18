"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LotCard } from "@/components/auction/LotCard";
import { IconHeart } from "@/components/ui/icons";

import styles from "./WatchlistGrid.module.css";

type WatchlistLot = {
  id: string;
  state: string;
  currentPrice: number;
  buyNowPrice: number | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  isWatchlisted: boolean;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    mileage: number;
    marketPrice: number | null;
    regionSpec: string | null;
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

function formatTitle(lot: WatchlistLot): string {
  return `${lot.vehicle.brand} ${lot.vehicle.model} ${lot.vehicle.year}`;
}

export function WatchlistGrid({ initialLots }: WatchlistGridProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("ALL");
  const [lots, setLots] = useState(initialLots);

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

  function handleWatchlistChange(lot: WatchlistLot, watchlisted: boolean): void {
    setLots((currentLots) => {
      const hasLot = currentLots.some((currentLot) => currentLot.id === lot.id);

      if (!watchlisted) {
        return currentLots.filter((currentLot) => currentLot.id !== lot.id);
      }

      if (hasLot) {
        return currentLots.map((currentLot) =>
          currentLot.id === lot.id ? { ...currentLot, isWatchlisted: true } : currentLot,
        );
      }

      return [lot, ...currentLots];
    });
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
            const normalizedStatus = normalizeStatus(lot.state);
            const endTime =
              normalizedStatus === "LIVE" || normalizedStatus === "EXTENDED"
                ? lot.endsAt ?? lot.startsAt ?? new Date().toISOString()
                : lot.startsAt ?? lot.endsAt ?? new Date().toISOString();

            return (
              <div key={lot.id}>
                <LotCard
                  lotId={lot.id}
                  title={formatTitle(lot)}
                  year={lot.vehicle.year}
                  mileage={lot.vehicle.mileage}
                  regionSpec={lot.vehicle.regionSpec ?? undefined}
                  imageUrl={lot.vehicle.images[0] || "/vehicle-photo.svg"}
                  currentBid={lot.currentPrice}
                  status={lot.state}
                  endTime={endTime}
                  marketPrice={lot.vehicle.marketPrice ?? undefined}
                  buyNowPrice={lot.buyNowPrice ?? undefined}
                  showWishlistControl
                  defaultWatchlisted={lot.isWatchlisted}
                  onWatchlistChange={(watchlisted) => handleWatchlistChange(lot, watchlisted)}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
