"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError, api, getApiErrorPayload } from "@/src/lib/api-client";
import {
  type FinanceInvoiceReadModel,
  describeDeadlineWindow,
  formatAed,
  formatCompactDateTime,
  getDeadlineUrgency,
} from "../../domain/mvp_read_model_stub";
import { StatusChip } from "./status_chip";
import { InlineFeedback } from "./toast_inline_feedback";

type FinanceTableProps = {
  invoices: FinanceInvoiceReadModel[];
};

type PaymentIntentFeedback = {
  tone: "success" | "info" | "warning" | "error";
  title: string;
  detail?: string;
  code?: string;
};

type PendingState = Record<string, boolean>;
type FeedbackState = Record<string, PaymentIntentFeedback | undefined>;
type KeyState = Record<string, string>;

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function mapUrgencyTone(urgency: ReturnType<typeof getDeadlineUrgency>) {
  switch (urgency) {
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "resolved":
      return "resolved";
    default:
      return "neutral";
  }
}

function defaultKeysForInvoices(invoices: FinanceInvoiceReadModel[]): KeyState {
  return invoices.reduce<KeyState>((accumulator, invoice) => {
    accumulator[invoice.invoiceId] = createIdempotencyKey();
    return accumulator;
  }, {});
}

function normalizePaymentIntentError(errorCode: string | undefined, status: number): PaymentIntentFeedback {
  if (status === 404 || errorCode === "INVOICE_NOT_FOUND") {
    return {
      tone: "error",
      title: "Invoice not found in backend",
      detail: "The frontend is using temporary read-model data. Sync with real invoice IDs before launch.",
      code: errorCode ?? `HTTP_${status}`,
    };
  }

  if (status === 409 || errorCode === "PAYMENT_INTENT_IN_PROGRESS") {
    return {
      tone: "warning",
      title: "Payment intent already in progress",
      detail: "Retry with the same Idempotency-Key to safely replay the same response.",
      code: errorCode ?? `HTTP_${status}`,
    };
  }

  if (status === 400 || status === 422) {
    return {
      tone: "warning",
      title: "Payment intent request rejected",
      detail: "Confirm invoice status is ISSUED and keep the same Idempotency-Key for retries.",
      code: errorCode ?? `HTTP_${status}`,
    };
  }

  if (status >= 500) {
    return {
      tone: "error",
      title: "Payment service error",
      detail: "Do not rotate the key yet. Retry safely using the same key after a short wait.",
      code: errorCode ?? `HTTP_${status}`,
    };
  }

  return {
    tone: "error",
    title: "Payment intent request failed",
    detail: "Retry with the same Idempotency-Key unless payload changes are required.",
    code: errorCode ?? `HTTP_${status}`,
  };
}

export function FinanceTable({ invoices }: FinanceTableProps) {
  const [idempotencyKeys, setIdempotencyKeys] = useState<KeyState>(() => defaultKeysForInvoices(invoices));
  const [pendingByInvoice, setPendingByInvoice] = useState<PendingState>({});
  const [feedbackByInvoice, setFeedbackByInvoice] = useState<FeedbackState>({});

  useEffect(() => {
    setIdempotencyKeys((previous) => {
      const next = { ...previous };

      for (const invoice of invoices) {
        if (!next[invoice.invoiceId]) {
          next[invoice.invoiceId] = createIdempotencyKey();
        }
      }

      return next;
    });
  }, [invoices]);

  const sortedInvoices = useMemo(
    () =>
      invoices
        .slice()
        .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()),
    [invoices],
  );

  async function submitIntent(invoice: FinanceInvoiceReadModel): Promise<void> {
    const invoiceId = invoice.invoiceId;
    const key = idempotencyKeys[invoiceId];

    if (!key || key.trim().length === 0) {
      setFeedbackByInvoice((previous) => ({
        ...previous,
        [invoiceId]: {
          tone: "warning",
          title: "Idempotency-Key is required",
          detail: "Generate or enter a key before creating payment intent.",
          code: "MISSING_IDEMPOTENCY_KEY",
        },
      }));
      return;
    }

    setPendingByInvoice((previous) => ({ ...previous, [invoiceId]: true }));
    setFeedbackByInvoice((previous) => ({ ...previous, [invoiceId]: undefined }));

    try {
      const payload = await api.payments.invoice.createIntent<{
        error_code?: string;
        message?: string;
        replayed?: boolean;
        stripe_payment_intent_id?: string;
      }>(invoiceId, key.trim());

      const replayed = Boolean(payload?.replayed);
      const stripeIntentId =
        typeof payload?.stripe_payment_intent_id === "string"
          ? payload.stripe_payment_intent_id
          : "created";

      setFeedbackByInvoice((previous) => ({
        ...previous,
        [invoiceId]: {
          tone: "success",
          title: replayed ? "Existing payment intent replayed" : "Payment intent created",
          detail: `Stripe PaymentIntent: ${stripeIntentId}`,
          code: replayed ? "REPLAYED" : "CREATED",
        },
      }));
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = getApiErrorPayload<{ error_code?: string }>(error);
        setFeedbackByInvoice((previous) => ({
          ...previous,
          [invoiceId]: normalizePaymentIntentError(payload?.error_code, error.statusCode),
        }));
        return;
      }

      setFeedbackByInvoice((previous) => ({
        ...previous,
        [invoiceId]: {
          tone: "error",
          title: "Network error",
          detail: "Retry safely with the same Idempotency-Key.",
          code: "NETWORK_ERROR",
        },
      }));
    } finally {
      setPendingByInvoice((previous) => ({ ...previous, [invoiceId]: false }));
    }
  }

  return (
    <section className="surface-panel">
      <div className="section-heading">
        <h2>Payment pending desk</h2>
        <p className="text-muted">
          48h deadline policy: unresolved invoices can default and winner deposit can be burned once.
        </p>
      </div>

      <div className="finance-table-scroll">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Deadline</th>
              <th>Urgency</th>
              <th>Payment action</th>
            </tr>
          </thead>
          <tbody>
            {sortedInvoices.map((invoice) => {
              const urgency = getDeadlineUrgency(invoice.dueAt, invoice.deadlineStatus);
              const tone = mapUrgencyTone(urgency);
              const pending = pendingByInvoice[invoice.invoiceId] === true;
              const feedback = feedbackByInvoice[invoice.invoiceId];

              return (
                <tr key={invoice.invoiceId}>
                  <td>
                    <p className="cell-title">{invoice.lotCode}</p>
                    <p className="text-muted">{invoice.lotTitle}</p>
                  </td>
                  <td>
                    <p className="cell-title">{invoice.invoiceId}</p>
                    <p className="text-muted">{invoice.invoiceStatus}</p>
                  </td>
                  <td>
                    <p className="cell-title">{formatAed(invoice.totalAed)}</p>
                    <p className="text-muted">Deposit lock: {formatAed(invoice.winnerDepositAed)}</p>
                  </td>
                  <td>
                    <p className="cell-title">{formatCompactDateTime(invoice.dueAt)}</p>
                    <p className="text-muted">{describeDeadlineWindow(invoice.dueAt, invoice.deadlineStatus)}</p>
                  </td>
                  <td>
                    <StatusChip label={urgency.toUpperCase()} tone={tone} />
                  </td>
                  <td>
                    <div className="payment-intent-cell">
                      <label>
                        Idempotency-Key
                        <input
                          value={idempotencyKeys[invoice.invoiceId] ?? ""}
                          onChange={(event) =>
                            setIdempotencyKeys((previous) => ({
                              ...previous,
                              [invoice.invoiceId]: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <div className="payment-intent-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={pending}
                          onClick={() => submitIntent(invoice)}
                        >
                          {pending ? "Submitting..." : "Create intent"}
                        </button>

                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() =>
                            setIdempotencyKeys((previous) => ({
                              ...previous,
                              [invoice.invoiceId]: createIdempotencyKey(),
                            }))
                          }
                        >
                          Regenerate
                        </button>
                      </div>

                      {feedback ? (
                        <InlineFeedback
                          tone={feedback.tone}
                          title={feedback.title}
                          detail={feedback.detail}
                          code={feedback.code}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
