"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BidLadder } from "@/components/seller/BidLadder";
import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { formatAed, formatSellerDateTime } from "@/components/seller/utils";
import { CountdownTimer } from "@/components/ui/CountdownTimer";

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
    buyNowPriceAed: number;
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
  const [loading, setLoading] = useState(true);
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

  const loadAuction = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/seller/auctions/${auctionId}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as AuctionDetailResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Failed to load auction");
      }

      const parsed = payload as AuctionDetailResponse;
      setData(parsed);
      setEditForm({
        startsAt: parsed.auction.startsAt.slice(0, 16),
        endsAt: parsed.auction.endsAt.slice(0, 16),
        startingPriceAed: String(parsed.auction.startingPriceAed),
        buyNowPriceAed: parsed.auction.buyNowPriceAed ? String(parsed.auction.buyNowPriceAed) : "",
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    void loadAuction();
  }, [loadAuction]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadAuction();
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
        payload.startsAt = new Date(editForm.startsAt).toISOString();
        payload.endsAt = new Date(editForm.endsAt).toISOString();
        payload.startingPriceAed = Number(editForm.startingPriceAed);

        if (editForm.buyNowPriceAed.trim()) {
          payload.buyNowPriceAed = Number(editForm.buyNowPriceAed);
        }
      }

      const response = await fetch(`/api/seller/auctions/${auctionId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(result?.message ?? result?.error ?? "Auction update failed");
      }

      await loadAuction();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Auction update failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-muted">Loading auction...</p>;
  }

  if (error) {
    return <p className="inline-note tone-error">{error}</p>;
  }

  if (!data) {
    return <p className="text-muted">Auction not found.</p>;
  }

  const state = data.auction.state.toUpperCase();

  return (
    <section className="seller-section-stack">
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
          <AuctionStatusBadge state={data.auction.state} />
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
                min={1}
                value={editForm.startingPriceAed}
                onChange={(event) => setEditForm((previous) => ({ ...previous, startingPriceAed: event.target.value }))}
              />
            </label>

            <label>
              Buy Now Price (AED)
              <input
                type="number"
                min={1}
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
