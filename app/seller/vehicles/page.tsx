"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SellerTabs } from "@/components/seller/SellerTabs";
import { VehicleListCard } from "@/components/seller/VehicleListCard";
import { api, getApiErrorMessage } from "@/src/lib/api-client";

type SellerVehiclesResponse = {
  total: number;
  vehicles: Array<{
    id: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    mileageKm: number;
    images: string[];
    latestAuction: {
      id: string;
      state: string;
      createdAt: string;
      startsAt: string;
      endsAt: string;
      currentBidAed: number;
    } | null;
  }>;
};

const STATUS_OPTIONS = ["ALL", "DRAFT", "SCHEDULED", "LIVE", "ENDED"] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const;

export default function SellerVehiclesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("ALL");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SellerVehiclesResponse>({ total: 0, vehicles: [] });

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("q", search.trim());
      }

      if (status !== "ALL") {
        params.set("status", status);
      }

      params.set("sort", sort);

      const payload = await api.seller.vehicles.list<SellerVehiclesResponse>(
        params,
        {
        cache: "no-store",
        },
      );

      setData(payload ?? { total: 0, vehicles: [] });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unexpected error"));
    } finally {
      setLoading(false);
    }
  }, [search, status, sort]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const summary = useMemo(() => {
    if (loading) {
      return "Loading vehicles...";
    }

    return `${data.total} vehicle${data.total === 1 ? "" : "s"}`;
  }, [data.total, loading]);

  return (
    <section className="seller-section-stack">
      <SellerTabs />

      <section className="surface-panel seller-section-block">
        <div className="seller-filter-row">
          <label className="seller-filter-field seller-filter-grow">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Make, model, VIN"
            />
          </label>

          <label className="seller-filter-field">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as (typeof STATUS_OPTIONS)[number])}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="seller-filter-field">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as (typeof SORT_OPTIONS)[number]["value"])}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="button button-secondary" onClick={() => void loadVehicles()}>
            Apply
          </button>
        </div>

        <p className="text-muted" style={{ marginTop: "10px" }}>
          {summary}
        </p>
      </section>

      {error ? <p className="inline-note tone-error">{error}</p> : null}

      {loading ? <p className="text-muted">Loading...</p> : null}

      {!loading && data.vehicles.length === 0 ? (
        <section className="surface-panel seller-section-block">
          <p className="text-muted">No vehicles found.</p>
          <Link href="/seller/vehicles/new" className="button button-primary">
            + Add Vehicle
          </Link>
        </section>
      ) : null}

      {!loading && data.vehicles.length > 0 ? (
        <section className="seller-vehicle-list">
          {data.vehicles.map((vehicle) => (
            <VehicleListCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </section>
      ) : null}
    </section>
  );
}
