"use client";

import { FormEvent, useMemo, useState } from "react";

import { ApiError, api, getApiErrorPayload } from "@/src/lib/api-client";
import { formatAed } from "../../domain/mvp_read_model_stub";
import {
  InlineFeedback,
  ToastStack,
  type FeedbackTone,
  type ToastMessage,
} from "./toast_inline_feedback";

type BidTicketProps = {
  auctionId: string;
  minBidAed: number;
  minIncrementAed: number;
  depositRequiredAed: number;
};

type BidFeedback = {
  title: string;
  detail?: string;
  tone: FeedbackTone;
  code?: string;
};

type BidApiPayload = {
  error_code?: string;
  message?: string;
  bid_id?: string;
  sequence_no?: number;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeBidFailure(
  status: number,
  payload: BidApiPayload | null,
): BidFeedback {
  const errorCode = payload?.error_code;

  if (status === 409 && errorCode === "IDEMPOTENCY_CONFLICT") {
    return {
      tone: "warning",
      title: "Idempotency mismatch",
      detail:
        "This key was previously used with a different payload. Keep payload identical for safe retry, or generate a new key.",
      code: errorCode,
    };
  }

  if (status === 409 && errorCode === "IDEMPOTENCY_IN_PROGRESS") {
    return {
      tone: "info",
      title: "Previous request still processing",
      detail: "Retry with the same Idempotency-Key after a short delay.",
      code: errorCode,
    };
  }

  if (status === 409 && (errorCode === "NO_DEPOSIT_NO_BID" || errorCode === "DEPOSIT_REQUIRED")) {
    return {
      tone: "warning",
      title: "Deposit lock required",
      detail:
        "NO DEPOSIT = NO BID. Fund deposit availability first, then retry with a new bid request.",
      code: errorCode,
    };
  }

  if (status === 429 && errorCode === "BID_RATE_LIMITED") {
    return {
      tone: "warning",
      title: "Bid rate limit reached",
      detail: "Wait briefly and retry with the same Idempotency-Key for safe replay behavior.",
      code: errorCode,
    };
  }

  if (status === 429 && errorCode === "BID_FLOOD_PROTECTED") {
    return {
      tone: "warning",
      title: "Contention flood protection active",
      detail:
        "High contention detected. Retry with the same key after cooldown to avoid duplicate side effects.",
      code: errorCode,
    };
  }

  if (status === 503 && errorCode === "BIDDING_DISABLED") {
    return {
      tone: "error",
      title: "Bidding temporarily disabled",
      detail:
        "Circuit breaker is active. Keep this key if retrying later with the same payload.",
      code: errorCode,
    };
  }

  if (status >= 500) {
    return {
      tone: "error",
      title: "Unexpected service error",
      detail: "On uncertain network/server outcomes, retry safely with the same Idempotency-Key.",
      code: errorCode ?? `HTTP_${status}`,
    };
  }

  return {
    tone: "error",
    title: "Bid request rejected",
    detail: payload?.message ?? "Review request values and retry with a valid idempotency key.",
    code: errorCode ?? `HTTP_${status}`,
  };
}

export function BidTicket({ auctionId, minBidAed, minIncrementAed, depositRequiredAed }: BidTicketProps) {
  const [companyId, setCompanyId] = useState("replace-with-approved-company-uuid");
  const [userId, setUserId] = useState("replace-with-approved-user-uuid");
  const [amount, setAmount] = useState<string>(String(minBidAed));
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<BidFeedback | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const numericAmount = useMemo(() => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }, [amount]);

  const canSubmit =
    !isSubmitting &&
    companyId.trim().length > 0 &&
    userId.trim().length > 0 &&
    numericAmount !== null &&
    numericAmount >= minBidAed;

  async function copyIdempotencyKey(): Promise<void> {
    try {
      await navigator.clipboard.writeText(idempotencyKey);
      const toast: ToastMessage = {
        id: `${Date.now()}`,
        tone: "success",
        title: "Idempotency-Key copied",
        detail: "Use the same key for safe retry if network uncertainty happens.",
      };
      setToasts((current) => [toast, ...current].slice(0, 3));
    } catch {
      const toast: ToastMessage = {
        id: `${Date.now()}`,
        tone: "warning",
        title: "Copy failed",
        detail: "Select and copy manually.",
      };
      setToasts((current) => [toast, ...current].slice(0, 3));
    }
  }

  async function submitBid(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit || numericAmount === null) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = await api.bids.place<{
        bid?: {
          sequenceNo?: number;
        };
      }>(auctionId, numericAmount, idempotencyKey.trim());

      setFeedback({
        tone: "success",
        title: "Bid accepted",
        detail:
          typeof payload.bid?.sequenceNo === "number"
            ? `Sequence #${payload.bid.sequenceNo} confirmed. Safe retries use the same key.`
            : "Command completed. Keep this key if response confirmation is needed.",
        code: "HTTP_201",
      });

      const toast: ToastMessage = {
        id: `${Date.now()}`,
        tone: "success",
        title: "Bid command completed",
        detail: "Regenerate key only for a new bid payload.",
      };
      setToasts((current) => [toast, ...current].slice(0, 3));
    } catch (error) {
      if (error instanceof ApiError) {
        setFeedback(normalizeBidFailure(error.statusCode, getApiErrorPayload<BidApiPayload>(error)));
        return;
      }

      setFeedback({
        tone: "error",
        title: "Network interruption",
        detail: "Retry with the exact same Idempotency-Key to keep command semantics safe.",
        code: "NETWORK_ERROR",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface-panel bid-ticket-panel" id="bid-ticket">
      <div className="section-heading">
        <h2>Bid ticket</h2>
        <p className="text-muted">
          NO DEPOSIT = NO BID. First accepted bid requires available deposit that can be locked.
        </p>
      </div>

      <form className="bid-form" onSubmit={submitBid}>
        <label>
          Approved company ID
          <input
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <label>
          Approved user ID
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <label>
          Bid amount (AED)
          <input
            type="number"
            min={minBidAed}
            step={minIncrementAed}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>

        <label>
          Idempotency-Key
          <input
            value={idempotencyKey}
            onChange={(event) => setIdempotencyKey(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <div className="key-actions">
          <button type="button" className="button button-ghost" onClick={copyIdempotencyKey}>
            Copy key
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setIdempotencyKey(createIdempotencyKey())}
          >
            Regenerate key
          </button>
        </div>

        <div className="ticket-facts">
          <p>Minimum accepted bid: {formatAed(minBidAed)}</p>
          <p>Minimum increment: {formatAed(minIncrementAed)}</p>
          <p>Required deposit lock: {formatAed(depositRequiredAed)}</p>
        </div>

        <p className="text-muted">
          On uncertain outcomes, retry with the same key and same payload. Change key only for new bid intent.
        </p>

        <button type="submit" className="button button-primary" disabled={!canSubmit}>
          {isSubmitting ? "Submitting..." : "Submit bid"}
        </button>
      </form>

      {feedback ? (
        <InlineFeedback title={feedback.title} detail={feedback.detail} tone={feedback.tone} code={feedback.code} />
      ) : null}

      <ToastStack messages={toasts} />
    </section>
  );
}
