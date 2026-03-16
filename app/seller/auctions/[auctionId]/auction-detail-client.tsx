"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BidLadder } from "@/components/seller/BidLadder";
import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed, formatSellerDateTime } from "@/components/seller/utils";
import { CountdownTimer } from "@/components/ui/CountdownTimer";

type BackendAuctionDetailResponse = {
  auction: {
    id: string;
    state: string;
    startsAt: string;
    endsAt: string;
    inspectionDropoffDate: string | null;
    viewingEndsAt: string | null;
    auctionStartsAt: string | null;
    auctionEndsAt: string | null;
    startingPrice: number;
    buyNowPrice: number | null;
    currentPrice: number;
    bidsCount: number;
    vehicle: {
      id: string;
      brand: string;
      model: string;
      year: number;
      vin: string;
    } | null;
  };
  bids: Array<{
    id: string;
    rank: number;
    companyName: string;
    amount: number;
    createdAt: string;
  }>;
};

type AuctionDetailResponse = {
  auction: {
    id: string;
    state: string;
    startsAt: string;
    endsAt: string;
    inspectionDropoffDate: string | null;
    viewingEndsAt: string | null;
    auctionStartsAt: string | null;
    auctionEndsAt: string | null;
    startingPriceAed: number;
    buyNowPriceAed: number | null;
    currentBidAed: number;
    totalBids: number;
    vehicle: {
      id: string;
      brand: string;
      model: string;
      year: number;
      vin: string;
    } | null;
  };
  bids: Array<{
    id: string;
    rank: number;
    companyName: string;
    amountAed: number;
    createdAt: string;
  }>;
};

type SellerAuctionDetailClientProps = {
  auctionId: string;
};

const TIMELINE_STEPS = ["CREATED", "SCHEDULED", "LIVE", "ENDED"] as const;
const SELLER_AUCTION_PRICE_INCREMENT_AED = 500;

function isValidSellerAuctionPrice(value: number): boolean {
  return value >= SELLER_AUCTION_PRICE_INCREMENT_AED && value % SELLER_AUCTION_PRICE_INCREMENT_AED === 0;
}

function normalizeAuctionDetailResponse(payload: BackendAuctionDetailResponse): AuctionDetailResponse {
  return {
    auction: {
      id: payload.auction.id,
      state: payload.auction.state,
      startsAt: payload.auction.startsAt,
      endsAt: payload.auction.endsAt,
      inspectionDropoffDate: payload.auction.inspectionDropoffDate,
      viewingEndsAt: payload.auction.viewingEndsAt,
      auctionStartsAt: payload.auction.auctionStartsAt,
      auctionEndsAt: payload.auction.auctionEndsAt,
      startingPriceAed: payload.auction.startingPrice,
      buyNowPriceAed: payload.auction.buyNowPrice,
      currentBidAed: payload.auction.currentPrice,
      totalBids: payload.auction.bidsCount,
      vehicle: payload.auction.vehicle,
    },
    bids: payload.bids.map((bid) => ({
      id: bid.id,
      rank: bid.rank,
      companyName: bid.companyName,
      amountAed: bid.amount,
      createdAt: bid.createdAt,
    })),
  };
}

function stepState(step: (typeof TIMELINE_STEPS)[number], state: string): "done" | "active" | "todo" {
  const normalized = state.toUpperCase();
  const order = {
    CREATED: 0,
    DRAFT: 0,
    SCHEDULED: 1,
    LIVE: 2,
    EXTENDED: 2,
    ENDED: 3,
    CLOSED: 3,
    PAID: 3,
    PAYMENT_PENDING: 3,
    CANCELED: 3,
    DEFAULTED: 3,
    RELISTED: 3,
  } as const;

  const current = order[normalized as keyof typeof order] ?? 0;
  const target = order[step as keyof typeof order] ?? 0;

  if (target < current) {
    return "done";
  }

  if (target === current) {
    return "active";
  }

  return "todo";
}

export default function SellerAuctionDetailClient({ auctionId }: SellerAuctionDetailClientProps) {
  const searchParams = useSearchParams();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<AuctionDetailResponse | null>(null);
  const [editForm, setEditForm] = useState<{
    startsAt: string;
    endsAt: string;
    startingPriceAed: string;
    buyNowPriceAed: string;
  }>({
    startsAt: "",
    endsAt: "",
    startingPriceAed: "",
    buyNowPriceAed: "",
  });
  const created = searchParams.get("created") === "1";
  const partialSetup = searchParams.get("setup") === "partial";

  const loadAuction = useCallback(
    async ({ silent = false, syncForm = true }: { silent?: boolean; syncForm?: boolean } = {}) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }

      setError(null);

      try {
        const payload = await api.seller.auctions.get<BackendAuctionDetailResponse>(auctionId, { cache: "no-store" });
        const parsed = normalizeAuctionDetailResponse(payload);
        setData(parsed);

        if (syncForm) {
          setEditForm({
            startsAt: parsed.auction.startsAt.slice(0, 16),
            endsAt: parsed.auction.endsAt.slice(0, 16),
            startingPriceAed: String(parsed.auction.startingPriceAed),
            buyNowPriceAed: parsed.auction.buyNowPriceAed ? String(parsed.auction.buyNowPriceAed) : "",
          });
        }
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unexpected error"));
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setInitialLoading(false);
        }
      }
    },
    [auctionId],
  );

  useEffect(() => {
    void loadAuction();
  }, [loadAuction]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadAuction({ silent: true, syncForm: false });
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadAuction]);

  const countdownTarget = useMemo(() => {
    if (!data) {
      return null;
    }

    const state = data.auction.state.toUpperCase();

    if (state === "LIVE" || state === "EXTENDED") {
      return {
        iso: data.auction.endsAt,
        prefix: "Ends in",
      };
    }

    if (state === "SCHEDULED" || state === "DRAFT") {
      return {
        iso: data.auction.startsAt,
        prefix: "Starts in",
      };
    }

    return null;
  }, [data]);

  async function patchAuction(action: "publish" | "cancel" | "update"): Promise<void> {
    if (!data) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = { action };

      if (action === "update") {
        const startingPrice = Number(editForm.startingPriceAed);

        if (!isValidSellerAuctionPrice(startingPrice)) {
          setError("Starting Price must be at least AED 500 and in AED 500 increments.");
          return;
        }

        payload.startsAt = new Date(editForm.startsAt).toISOString();
        payload.endsAt = new Date(editForm.endsAt).toISOString();
        payload.startingPrice = startingPrice;

        if (editForm.buyNowPriceAed.trim()) {
          const buyNowPrice = Number(editForm.buyNowPriceAed);

          if (!isValidSellerAuctionPrice(buyNowPrice)) {
            setError("Buy Now Price must be at least AED 500 and in AED 500 increments.");
            return;
          }

          if (buyNowPrice <= startingPrice) {
            setError("Buy Now Price must be greater than Starting Price.");
            return;
          }

          payload.buyNowPrice = buyNowPrice;
        }
      }

      await api.seller.auctions.update(auctionId, payload);

      await loadAuction({ silent: true });
    } catch (patchError) {
      setError(getApiErrorMessage(patchError, "Auction update failed"));
    } finally {
      setBusy(false);
    }
  }

  if (initialLoading && !data) {
    return <p className="text-muted">Loading auction...</p>;
  }

  if (error && !data) {
    return <p className="inline-note tone-error">{error}</p>;
  }

  if (!data) {
    return <p className="text-muted">Auction not found.</p>;
  }

  const state = data.auction.state.toUpperCase();

  return (
    <section className="seller-section-stack">
      {error ? <p className="inline-note tone-error">{error}</p> : null}
      {created ? <p className="inline-note tone-success">Vehicle added and auction draft created</p> : null}
      {partialSetup ? (
        <p className="inline-note tone-warning">Vehicle was created, but some draft auction fields need review.</p>
      ) : null}

      <section className="surface-panel seller-section-block">
        <div className="seller-section-head">
          <div>
            <h2>
              {data.auction.vehicle
                ? `${data.auction.vehicle.brand} ${data.auction.vehicle.model} ${data.auction.vehicle.year}`
                : data.auction.id}
            </h2>
            <p className="text-muted">VIN: {data.auction.vehicle?.vin ?? "-"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {refreshing ? (
              <span className="text-muted" aria-live="polite">
                Refreshing...
              </span>
            ) : null}
            <AuctionStatusBadge state={data.auction.state} />
          </div>
        </div>

        {countdownTarget ? (
          <CountdownTimer
            targetIso={countdownTarget.iso}
            prefix={countdownTarget.prefix}
            overdueLabel="Ended"
            className="seller-countdown"
          />
        ) : null}
      </section>

      <section className="seller-kpi-row">
        <article className="surface-panel">
          <p>Starting Price</p>
          <strong>{formatAed(data.auction.startingPriceAed)}</strong>
        </article>
        <article className="surface-panel">
          <p>Buy Now Price</p>
          <strong>{data.auction.buyNowPriceAed ? formatAed(data.auction.buyNowPriceAed) : "-"}</strong>
        </article>
        <article className="surface-panel">
          <p>Current Bid</p>
          <strong>{formatAed(data.auction.currentBidAed)}</strong>
        </article>
        <article className="surface-panel">
          <p>Total Bids</p>
          <strong>{data.auction.totalBids}</strong>
        </article>
      </section>

      <BidLadder bids={data.bids} />

      <section className="surface-panel seller-section-block">
        <h3>Auction Timeline</h3>
        <div className="seller-timeline">
          {TIMELINE_STEPS.map((step) => (
            <div key={step} className={`seller-timeline-step ${stepState(step, state)}`}>
              <span>{step}</span>
            </div>
          ))}
        </div>

        <p className="text-muted" style={{ marginTop: "12px" }}>
          Starts: {formatSellerDateTime(data.auction.startsAt)} · Ends: {formatSellerDateTime(data.auction.endsAt)}
        </p>
      </section>

      {state === "DRAFT" ? (
        <section className="surface-panel seller-section-block">
          <h3>Edit Draft</h3>
          <div className="seller-form-grid">
            <label>
              Starting Price (AED)
              <input
                type="number"
                min={SELLER_AUCTION_PRICE_INCREMENT_AED}
                step={SELLER_AUCTION_PRICE_INCREMENT_AED}
                value={editForm.startingPriceAed}
                onChange={(event) => setEditForm((previous) => ({ ...previous, startingPriceAed: event.target.value }))}
              />
            </label>

            <label>
              Buy Now Price (AED)
              <input
                type="number"
                min={SELLER_AUCTION_PRICE_INCREMENT_AED}
                step={SELLER_AUCTION_PRICE_INCREMENT_AED}
                value={editForm.buyNowPriceAed}
                onChange={(event) => setEditForm((previous) => ({ ...previous, buyNowPriceAed: event.target.value }))}
              />
            </label>

            <label>
              Starts At
              <input
                type="datetime-local"
                value={editForm.startsAt}
                onChange={(event) => setEditForm((previous) => ({ ...previous, startsAt: event.target.value }))}
              />
            </label>

            <label>
              Ends At
              <input
                type="datetime-local"
                value={editForm.endsAt}
                onChange={(event) => setEditForm((previous) => ({ ...previous, endsAt: event.target.value }))}
              />
            </label>
          </div>

          <div className="seller-inline-actions" style={{ marginTop: "14px" }}>
            <button type="button" className="button button-secondary" onClick={() => void patchAuction("update")} disabled={busy}>
              {busy ? "Saving..." : "Save Draft"}
            </button>
            <button type="button" className="button button-primary" onClick={() => void patchAuction("publish")} disabled={busy}>
              Publish
            </button>
          </div>
        </section>
      ) : null}

      {state === "SCHEDULED" || state === "LIVE" || state === "EXTENDED" ? (
        <section className="seller-inline-actions">
          <button
            type="button"
            className="button button-secondary seller-danger-outline"
            onClick={() => void patchAuction("cancel")}
            disabled={busy}
          >
            {busy ? "Saving..." : "Cancel Auction"}
          </button>
        </section>
      ) : null}
    </section>
  );
}
