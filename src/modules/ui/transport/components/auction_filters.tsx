"use client";

import type { AuctionBoardFilters, AuctionStatus } from "../../domain/mvp_read_model_stub";

type AuctionFiltersProps = {
  filters: AuctionBoardFilters;
  onChange: (next: AuctionBoardFilters) => void;
  statusOptions: AuctionStatus[];
  locationOptions: string[];
  sellerOptions: string[];
  resultCount: number;
};

function toNullableNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.floor(numeric));
}

export function AuctionFilters({
  filters,
  onChange,
  statusOptions,
  locationOptions,
  sellerOptions,
  resultCount,
}: AuctionFiltersProps) {
  return (
    <section className="filters-panel" aria-label="Auction filters">
      <div className="filters-head">
        <h2>Auction board</h2>
        <p className="text-muted">{resultCount} lot(s) match filters</p>
      </div>

      <div className="filters-grid">
        <label>
          Search lot, seller, or location
          <input
            type="search"
            value={filters.query}
            placeholder="e.g. Land Cruiser"
            onChange={(event) =>
              onChange({
                ...filters,
                query: event.target.value,
              })
            }
          />
        </label>

        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) =>
              onChange({
                ...filters,
                status: event.target.value as AuctionBoardFilters["status"],
              })
            }
          >
            <option value="ALL">All statuses</option>
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
            onChange={(event) =>
              onChange({
                ...filters,
                location: event.target.value,
              })
            }
          >
            <option value="ALL">All locations</option>
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
            onChange={(event) =>
              onChange({
                ...filters,
                seller: event.target.value,
              })
            }
          >
            <option value="ALL">All sellers</option>
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
              onChange({
                ...filters,
                minPriceAed: toNullableNumber(event.target.value),
              })
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
              onChange({
                ...filters,
                maxPriceAed: toNullableNumber(event.target.value),
              })
            }
          />
        </label>
      </div>

      <button
        type="button"
        className="button button-ghost"
        onClick={() =>
          onChange({
            query: "",
            status: "ALL",
            location: "ALL",
            seller: "ALL",
            minPriceAed: null,
            maxPriceAed: null,
          })
        }
      >
        Reset filters
      </button>
    </section>
  );
}
