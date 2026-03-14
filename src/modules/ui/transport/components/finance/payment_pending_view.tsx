"use client";

import { useEffect, useState } from "react";

import {
  describeInvoiceDeadline,
  formatAed,
  formatShortDateTime,
  getInvoiceDeadlineTone,
  type InvoiceReadModel,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";

type PaymentPendingViewProps = {
  invoices: InvoiceReadModel[];
};

type PendingMap = Record<string, boolean>;
type KeyMap = Record<string, string>;
type FeedbackMap = Record<string, string | undefined>;

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function PaymentPendingView({ invoices }: PaymentPendingViewProps) {
  const issued = invoices.filter((invoice) => invoice.status === "ISSUED");
  const [pending, setPending] = useState<PendingMap>({});
  const [keys, setKeys] = useState<KeyMap>({});
  const [feedback, setFeedback] = useState<FeedbackMap>({});

  useEffect(() => {
    setKeys((previous) => {
      const next = { ...previous };
      for (const invoice of issued) {
        if (!next[invoice.id]) {
          next[invoice.id] = createIdempotencyKey();
        }
      }
      return next;
    });
  }, [issued]);

  async function createIntent(invoiceId: string) {
    const idempotencyKey = keys[invoiceId]?.trim();

    if (!idempotencyKey) {
      setFeedback((current) => ({ ...current, [invoiceId]: "Idempotency-Key is required." }));
      return;
    }

    setPending((current) => ({ ...current, [invoiceId]: true }));
    setFeedback((current) => ({ ...current, [invoiceId]: undefined }));

    try {
      const response = await fetch(`/api/payments/invoices/${invoiceId}/intent`, {
        method: "POST",
        headers: {
          "idempotency-key": idempotencyKey,
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            replayed?: boolean;
            stripe_payment_intent_id?: string;
            message?: string;
            error_code?: string;
          }
        | null;

      if (!response.ok) {
        setFeedback((current) => ({
          ...current,
          [invoiceId]: payload?.message ?? payload?.error_code ?? "Payment intent request rejected.",
        }));
        return;
      }

      const statusLabel = payload?.replayed ? "Payment intent replayed." : "Payment intent created.";
      const intentLabel = payload?.stripe_payment_intent_id ? ` ${payload.stripe_payment_intent_id}` : "";

      setFeedback((current) => ({
        ...current,
        [invoiceId]: `${statusLabel}${intentLabel}`,
      }));
    } catch {
      setFeedback((current) => ({
        ...current,
        [invoiceId]: "Network issue. Retry safely with the same Idempotency-Key.",
      }));
    } finally {
      setPending((current) => ({ ...current, [invoiceId]: false }));
    }
  }

  return (
    <section className="surface-panel">
      <div className="section-heading">
        <h2>Payment pending</h2>
        <p>Pay within 48h to avoid default and deposit burn policy.</p>
      </div>

      <div className="cards-stack" aria-label="Pending invoices">
        {issued.map((invoice) => {
          const tone = getInvoiceDeadlineTone(invoice.dueAt, invoice.status);
          const invoiceFeedback = feedback[invoice.id];

          return (
            <article key={invoice.id} className="finance-card">
              <div>
                <p className="card-eyebrow">{invoice.lotNumber}</p>
                <h3>{invoice.lotTitle}</h3>
                <p className="text-muted">Winner: {invoice.winnerCompany}</p>
              </div>

              <div className="finance-card-values">
                <p>
                  Total: <strong>{formatAed(invoice.totalAed)}</strong>
                </p>
                <p>Due: {formatShortDateTime(invoice.dueAt)}</p>
                <p className={`deadline-pill tone-${tone}`}>{describeInvoiceDeadline(invoice.dueAt, invoice.status)}</p>
                <LiveCountdown targetIso={invoice.dueAt} prefix="Countdown" className="small-countdown" />
              </div>

              <label>
                Idempotency-Key
                <input
                  value={keys[invoice.id] ?? ""}
                  onChange={(event) =>
                    setKeys((current) => ({
                      ...current,
                      [invoice.id]: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="inline-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={pending[invoice.id]}
                  onClick={() => {
                    void createIntent(invoice.id);
                  }}
                >
                  {pending[invoice.id] ? "Submitting..." : "Pay Now"}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() =>
                    setKeys((current) => ({
                      ...current,
                      [invoice.id]: createIdempotencyKey(),
                    }))
                  }
                >
                  Regenerate key
                </button>
              </div>

              {invoiceFeedback ? <p className="inline-note tone-info">{invoiceFeedback}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
