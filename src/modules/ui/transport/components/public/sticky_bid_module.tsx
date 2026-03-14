"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { formatAed } from "@/src/modules/ui/domain/marketplace_read_model";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";

type StickyBidModuleProps = {
  auctionId: string;
  initialCurrentBidAed: number;
  minimumStepAed: number;
  initialEndsAt: string;
  depositRequiredAed: number;
  depositReady: boolean;
};

type BidApiPayload = {
  error_code?: string;
  message?: string;
  sequence_no?: number;
};

type ModuleFeedback = {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  detail?: string;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function mapBidFailure(status: number, errorCode: string | undefined, fallbackMessage: string | undefined): ModuleFeedback {
  if (status === 409 && errorCode === "IDEMPOTENCY_CONFLICT") {
    return {
      tone: "warning",
      title: "Request key mismatch",
      detail: "Reuse the same key only with identical payload. Create a new key for a new bid amount.",
    };
  }

  if (status === 409 && (errorCode === "NO_DEPOSIT_NO_BID" || errorCode === "DEPOSIT_REQUIRED")) {
    return {
      tone: "warning",
      title: "Deposit required before bid",
      detail: "NO DEPOSIT = NO BID. Fund wallet deposit first, then bid again.",
    };
  }

  if (status === 429 && errorCode === "BID_RATE_LIMITED") {
    return {
      tone: "warning",
      title: "Too many bid attempts",
      detail: "Wait a few seconds and retry with the same Idempotency-Key.",
    };
  }

  if (status === 429 && errorCode === "BID_FLOOD_PROTECTED") {
    return {
      tone: "warning",
      title: "High contention on this lot",
      detail: "Please wait briefly and retry with the same request key.",
    };
  }

  if (status === 503 && errorCode === "BIDDING_DISABLED") {
    return {
      tone: "error",
      title: "Bidding is temporarily unavailable",
      detail: "Keep your key and retry later with the same payload.",
    };
  }

  return {
    tone: "error",
    title: "Bid was not accepted",
    detail: fallbackMessage ?? "Please review your amount and try again.",
  };
}

export function StickyBidModule({
  auctionId,
  initialCurrentBidAed,
  minimumStepAed,
  initialEndsAt,
  depositRequiredAed,
  depositReady,
}: StickyBidModuleProps) {
  const [companyId, setCompanyId] = useState("approved-company-uuid");
  const [userId, setUserId] = useState("approved-user-uuid");
  const [currentBidAed, setCurrentBidAed] = useState(initialCurrentBidAed);
  const [endsAt, setEndsAt] = useState(initialEndsAt);
  const [amount, setAmount] = useState(String(initialCurrentBidAed + minimumStepAed));
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<ModuleFeedback | null>(null);
  const [outcome, setOutcome] = useState<"winning" | "outbid" | "none">("none");
  const [lastMineBidAed, setLastMineBidAed] = useState<number | null>(null);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);

  const minimumNextBid = useMemo(() => currentBidAed + minimumStepAed, [currentBidAed, minimumStepAed]);

  useEffect(() => {
    setAmount((prev) => {
      const parsed = Number(prev);
      if (!Number.isFinite(parsed) || parsed < minimumNextBid) {
        return String(minimumNextBid);
      }

      return prev;
    });
  }, [minimumNextBid]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`/api/ui/auctions/${auctionId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          current_bid_aed?: number;
          ends_at?: string;
        };

        if (!active) {
          return;
        }

        if (typeof payload.current_bid_aed === "number") {
          setCurrentBidAed(payload.current_bid_aed);

          if (lastMineBidAed !== null) {
            if (payload.current_bid_aed > lastMineBidAed) {
              setOutcome("outbid");
            } else {
              setOutcome("winning");
            }
          }
        }

        if (typeof payload.ends_at === "string") {
          setEndsAt((previous) => {
            const previousMs = new Date(previous).getTime();
            const nextMs = new Date(payload.ends_at ?? previous).getTime();

            if (nextMs > previousMs + 20_000) {
              setExtensionNotice("Auction timer was extended due to late bidding activity.");
            }

            return payload.ends_at ?? previous;
          });
        }
      } catch {
        // Silent polling fallback.
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 5000);

    void poll();

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [auctionId, lastMineBidAed]);

  async function submitBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < minimumNextBid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/bids", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.trim(),
        },
        body: JSON.stringify({
          auction_id: auctionId,
          company_id: companyId.trim(),
          user_id: userId.trim(),
          amount: numericAmount,
        }),
      });

      const payload = (await response.json().catch(() => null)) as BidApiPayload | null;

      if (!response.ok) {
        setFeedback(mapBidFailure(response.status, payload?.error_code, payload?.message));
        return;
      }

      setLastMineBidAed(numericAmount);
      setCurrentBidAed((previous) => Math.max(previous, numericAmount));
      setOutcome("winning");
      setFeedback({
        tone: "success",
        title: "Bid placed",
        detail:
          typeof payload?.sequence_no === "number"
            ? `Your bid is recorded as sequence #${payload.sequence_no}.`
            : "Your bid request was accepted.",
      });
    } catch {
      setFeedback({
        tone: "error",
        title: "Connection interrupted",
        detail: "Retry with the same Idempotency-Key to avoid duplicate effects.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface-panel bid-module sticky-desktop" id="bid-module">
      <header className="bid-module-head">
        <h2>Place bid</h2>
        <p>Secure, deposit-gated bidding with safe retries.</p>
      </header>

      <div className="bid-kpi">
        <div>
          <p>Current bid</p>
          <strong>{formatAed(currentBidAed)}</strong>
        </div>
        <div>
          <p>Minimum next bid</p>
          <strong>{formatAed(minimumNextBid)}</strong>
        </div>
      </div>

      <LiveCountdown targetIso={endsAt} className="bid-countdown" prefix="Time remaining" overdueLabel="Auction ended" />

      {extensionNotice ? <p className="inline-note tone-warning">{extensionNotice}</p> : null}

      <div className={`deposit-indicator ${depositReady ? "is-ready" : "is-required"}`}>
        <span className="deposit-indicator-label">
          {depositReady ? (
            <ShieldCheck className="structural-icon" size={18} aria-hidden="true" />
          ) : (
            <ShieldAlert className="structural-icon" size={18} aria-hidden="true" />
          )}
          <span>{depositReady ? "Deposit Ready" : "Deposit Required"}</span>
        </span>
        <strong>{formatAed(depositRequiredAed)}</strong>
        {!depositReady ? (
          <Link href="/wallet" className="inline-link">
            Add deposit in wallet
          </Link>
        ) : null}
      </div>

      {outcome === "winning" ? <p className="inline-note tone-success">You are currently winning.</p> : null}
      {outcome === "outbid" ? <p className="inline-note tone-warning">You have been outbid.</p> : null}

      <form className="bid-form" onSubmit={submitBid}>
        <label>
          Bid amount (AED)
          <input
            type="number"
            min={minimumNextBid}
            step={minimumStepAed}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>

        <label className="visually-compressed">
          Approved company ID
          <input
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <label className="visually-compressed">
          Approved user ID
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <label className="idempotency-field">
          Idempotency-Key
          <input
            value={idempotencyKey}
            onChange={(event) => setIdempotencyKey(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <div className="inline-actions">
          <button type="button" className="button button-ghost" onClick={() => setIdempotencyKey(createIdempotencyKey())}>
            Regenerate key
          </button>
          <button type="submit" className="button button-primary" disabled={isSubmitting || !depositReady}>
            {isSubmitting ? "Placing..." : "Place Bid"}
          </button>
        </div>
      </form>

      {feedback ? (
        <p className={`inline-note tone-${feedback.tone}`}>
          <strong>{feedback.title}</strong>
          {feedback.detail ? ` ${feedback.detail}` : ""}
        </p>
      ) : null}

      <p className="bid-helper-copy">On network uncertainty, retry with the same key and same amount.</p>
    </section>
  );
}
