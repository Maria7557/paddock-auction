"use client";

import { useMemo, useState } from "react";

import {
  DEFAULT_AUCTION_FILTERS,
  type AuctionFilterState,
  type AuctionLot,
  filterAndSortAuctions,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { AuctionLotCard } from "./auction_lot_card";

type AuctionFilterSidebarProps = {
  lots: AuctionLot[];
};

function toNullableInt(raw: string): number | null {
  if (raw.trim().length === 0) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

export function AuctionFilterSidebar({ lots }: AuctionFilterSidebarProps) {
  const [filters, setFilters] = useState<AuctionFilterState>(DEFAULT_AUCTION_FILTERS);
  const [mobileOpen, setMobileOpen] = useState(false);

  const statusOptions = useMemo(
    () => Array.from(new Set(lots.map((lot) => lot.status))).sort(),
    [lots],
  );
  const sellerOptions = useMemo(
    () => Array.from(new Set(lots.map((lot) => lot.seller))).sort(),
    [lots],
  );
  const locationOptions = useMemo(
    () => Array.from(new Set(lots.map((lot) => lot.location))).sort(),
    [lots],
  );

  const filteredLots = useMemo(() => filterAndSortAuctions(lots, filters), [lots, filters]);

  return (
    <section className="listing-layout">
      <button
        type="button"
        className="button button-ghost listing-mobile-filter-toggle"
        onClick={() => setMobileOpen((value) => !value)}
      >
        {mobileOpen ? "Hide filters" : "Show filters"}
      </button>

      <aside className={`listing-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <h2>Filters</h2>
          <p>{filteredLots.length} lots match</p>
        </div>

        <label>
          Search
          <input
            type="search"
            placeholder="Lot, make, seller"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </label>

        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as AuctionFilterState["status"],
              }))
            }
          >
            <option value="ALL">All</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label>
          Location
          <select
            value={filters.location}
            onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
          >
            <option value="ALL">All</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>

        <label>
          Seller
          <select
            value={filters.seller}
            onChange={(event) => setFilters((current) => ({ ...current, seller: event.target.value }))}
          >
            <option value="ALL">All</option>
            {sellerOptions.map((seller) => (
              <option key={seller} value={seller}>
                {seller}
              </option>
            ))}
          </select>
        </label>

        <label>
          Min price (AED)
          <input
            type="number"
            min={0}
            value={filters.minPriceAed ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                minPriceAed: toNullableInt(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Max price (AED)
          <input
            type="number"
            min={0}
            value={filters.maxPriceAed ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxPriceAed: toNullableInt(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Min year
          <input
            type="number"
            min={1990}
            max={2030}
            value={filters.minYear ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                minYear: toNullableInt(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Max mileage (KM)
          <input
            type="number"
            min={0}
            value={filters.maxMileageKm ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxMileageKm: toNullableInt(event.target.value),
              }))
            }
          />
        </label>

        <label className="sidebar-checkbox">
          <input
            type="checkbox"
            checked={filters.endingSoonOnly}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                endingSoonOnly: event.target.checked,
              }))
            }
          />
          Ending soon
        </label>

        <label>
          Sort
          <select
            value={filters.sortBy}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sortBy: event.target.value as AuctionFilterState["sortBy"],
              }))
            }
          >
            <option value="ENDING_SOON">Ending soon</option>
            <option value="LOWEST_PRICE">Lowest price</option>
            <option value="HIGHEST_BIDS">Highest bids</option>
            <option value="RECENTLY_ADDED">Recently added</option>
          </select>
        </label>

        <button type="button" className="button button-ghost" onClick={() => setFilters(DEFAULT_AUCTION_FILTERS)}>
          Reset filters
        </button>
      </aside>

      <div className="listing-grid" aria-label="Auction lots">
        {filteredLots.map((lot) => (
          <AuctionLotCard key={lot.id} lot={lot} />
        ))}
      </div>
    </section>
  );
}
