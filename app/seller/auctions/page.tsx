"use client";

import { useCallback, useEffect, useState } from "react";

import { AuctionRowCard } from "@/components/seller/AuctionRowCard";
import { api, getApiErrorMessage } from "@/src/lib/api-client";

type AuctionsResponse = {
  total: number;
  auctions: Array<{
    id: string;
    state: string;
    vehicleId: string;
    vehicleLabel: string;
    startingPriceAed: number;
    currentBidAed: number;
    bidsCount: number;
    startsAt: string;
    endsAt: string;
  }>;
};

const STATUS_OPTIONS = ["ALL", "DRAFT", "SCHEDULED", "LIVE", "ENDED"] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const;

export default function SellerAuctionsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("ALL");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [data, setData] = useState<AuctionsResponse>({ total: 0, auctions: [] });

  const loadAuctions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (query.trim()) {
        params.set("q", query.trim());
      }

      if (status !== "ALL") {
        params.set("status", status);
      }

      params.set("sort", sort);

      const payload = await api.seller.auctions.list<AuctionsResponse>(
        params,
        {
        cache: "no-store",
        },
      );

      setData(payload ?? { total: 0, auctions: [] });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unexpected error"));
    } finally {
      setLoading(false);
    }
  }, [query, status, sort]);

  useEffect(() => {
    void loadAuctions();
  }, [loadAuctions]);

  async function handleAction(auctionId: string, action: "publish" | "cancel"): Promise<void> {
    setBusyActionId(auctionId);
    setError(null);

    try {
      await api.seller.auctions.update(auctionId, { action });

      await loadAuctions();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, "Action failed"));
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <section className="seller-section-stack">
      <section className="surface-panel seller-section-block">
        <div className="seller-filter-row">
          <label className="seller-filter-field seller-filter-grow">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Vehicle or VIN"
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

          <button type="button" className="button button-secondary" onClick={() => void loadAuctions()}>
            Apply
          </button>
        </div>
      </section>

      {error ? <p className="inline-note tone-error">{error}</p> : null}

      <section className="surface-panel seller-section-block">
        <div className="seller-section-head">
          <h2>Auctions</h2>
          <p className="text-muted">{loading ? "Loading..." : `${data.total} total`}</p>
        </div>

        <div className="seller-table-scroll">
          <table className="seller-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>State</th>
                <th>Starting Price</th>
                <th>Current Bid</th>
                <th># Bids</th>
                <th>Ends At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.auctions.map((auction) => (
                <AuctionRowCard
                  key={auction.id}
                  auction={auction}
                  onAction={(auctionId, action) => {
                    void handleAction(auctionId, action);
                  }}
                  busyActionId={busyActionId}
                />
              ))}
              {!loading && data.auctions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="seller-empty-cell">
                    No auctions found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
