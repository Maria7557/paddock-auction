"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SellerDecisionCard } from "@/components/seller/SellerDecisionCard";
import { SellerTabs } from "@/components/seller/SellerTabs";
import { VehicleListCard } from "@/components/seller/VehicleListCard";
import { ApiError, api, getApiErrorMessage } from "@/src/lib/api-client";
import type { SellerPendingDecisionItem, SellerPendingDecisionResponse } from "@/src/types/auction";

type SellerVehiclesResponse = {
  total: number;
  vehicles: Array<{
    id: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    mileage: number;
    images: string[];
    latestAuction: {
      id: string;
      state: string;
      createdAt: string;
      startsAt: string;
      endsAt: string;
      currentPrice: number;
      decisionDeadlineAt: string | null;
    } | null;
  }>;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "AWAITING_SELLER_DECISION", label: "Pending Decision" },
  { value: "DRAFT", label: "Draft" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "LIVE", label: "Live" },
  { value: "ENDED", label: "Ended" },
] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const;
const EMPTY_PENDING_RESPONSE: SellerPendingDecisionResponse = {
  pending: [],
};

function normalizePendingResponse(
  payload: Partial<SellerPendingDecisionResponse> | null | undefined,
): SellerPendingDecisionResponse {
  return {
    pending: Array.isArray(payload?.pending) ? payload.pending : [],
  };
}

export default function SellerVehiclesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("ALL");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SellerVehiclesResponse>({ total: 0, vehicles: [] });
  const [pendingData, setPendingData] = useState<SellerPendingDecisionResponse>(EMPTY_PENDING_RESPONSE);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [busyDecision, setBusyDecision] = useState<{
    auctionId: string;
    action: "accept" | "decline";
  } | null>(null);

  const redirectToLogin = useCallback(() => {
    router.replace("/login?next=/seller/vehicles");
  }, [router]);

  const loadVehicles = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    }

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
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        redirectToLogin();
        return;
      }

      setError(getApiErrorMessage(requestError, "Unexpected error"));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [redirectToLogin, search, sort, status]);

  const loadPendingDecisions = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setPendingLoading(true);
    }

    try {
      setPendingError(null);

      const response = await api.seller.decisions.pending<SellerPendingDecisionResponse>({
        cache: "no-store",
      });

      setPendingData(normalizePendingResponse(response));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        redirectToLogin();
        return;
      }

      setPendingError(getApiErrorMessage(requestError, "Unable to load pending decisions right now."));
    } finally {
      if (showLoader) {
        setPendingLoading(false);
      }
    }
  }, [redirectToLogin]);

  const handleAuctionDecision = useCallback(
    async (auctionId: string, decision: "accept" | "decline") => {
      setBusyDecision({
        auctionId,
        action: decision,
      });

      try {
        await api.seller.auctions.decision(
          auctionId,
          { decision },
          {
            cache: "no-store",
          },
        );
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          redirectToLogin();
          return;
        }

        setPendingError(getApiErrorMessage(requestError, "Unable to save your decision right now."));
        return;
      } finally {
        setBusyDecision(null);
      }

      await Promise.all([
        loadVehicles(false),
        loadPendingDecisions(false),
      ]);
    },
    [loadPendingDecisions, loadVehicles, redirectToLogin],
  );

  useEffect(() => {
    void loadVehicles();
    void loadPendingDecisions();
  }, [loadPendingDecisions, loadVehicles]);

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
            <select value={status} onChange={(event) => setStatus(event.target.value as (typeof STATUS_OPTIONS)[number]["value"])}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
      {pendingError ? <p className="inline-note tone-error">{pendingError}</p> : null}

      {pendingLoading ? (
        <section className="surface-panel seller-section-block sellerDecisionSection">
          <div className="sellerDecisionHeader">
            <div>
              <div className="eyebrow eyebrow-green">Seller Approval</div>
              <h2>Pending Decisions</h2>
              <p>Loading lots that require seller approval.</p>
            </div>
          </div>
        </section>
      ) : pendingData.pending.length > 0 ? (
        <section className="surface-panel seller-section-block sellerDecisionSection">
          <div className="sellerDecisionHeader">
            <div>
              <div className="eyebrow eyebrow-green">Seller Approval</div>
              <h2>{pendingData.pending.length} pending decision{pendingData.pending.length === 1 ? "" : "s"}</h2>
              <p>Lots with winning bids stay here until you accept or decline them.</p>
            </div>

            <Link href="/seller/decisions" className="button button-secondary">
              Open Decision Queue
            </Link>
          </div>

          <div className="sellerDecisionGrid">
            {pendingData.pending.map((item: SellerPendingDecisionItem) => (
              <SellerDecisionCard
                key={item.auctionId}
                {...item}
                busyAction={busyDecision?.auctionId === item.auctionId ? busyDecision.action : null}
                onAccept={(auctionId) => handleAuctionDecision(auctionId, "accept")}
                onDecline={(auctionId) => handleAuctionDecision(auctionId, "decline")}
              />
            ))}
          </div>
        </section>
      ) : null}

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
            <VehicleListCard
              key={vehicle.id}
              vehicle={vehicle}
              onDecision={handleAuctionDecision}
            />
          ))}
        </section>
      ) : null}

      <style jsx>{`
        .sellerDecisionSection {
          display: grid;
          gap: var(--space-3);
        }

        .sellerDecisionHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3);
        }

        .sellerDecisionHeader h2 {
          margin: 8px 0 0;
          font-size: clamp(24px, 4vw, 32px);
          line-height: 1.02;
          color: var(--ink-primary);
        }

        .sellerDecisionHeader p {
          margin: 10px 0 0;
          max-width: 680px;
          color: var(--ink-secondary);
        }

        .sellerDecisionGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-3);
        }

        @media (max-width: 980px) {
          .sellerDecisionHeader {
            flex-direction: column;
          }

          .sellerDecisionGrid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </section>
  );
}
