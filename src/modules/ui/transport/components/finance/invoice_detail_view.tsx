"use client";

import { useState } from "react";

import {
  describeInvoiceDeadline,
  formatAed,
  formatLongDate,
  getInvoiceDeadlineTone,
  type InvoiceReadModel,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";

type InvoiceDetailViewProps = {
  invoice: InvoiceReadModel;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function InvoiceDetailView({ invoice }: InvoiceDetailViewProps) {
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const tone = getInvoiceDeadlineTone(invoice.dueAt, invoice.status);
  const isOverdue = tone === "critical" && new Date(invoice.dueAt).getTime() <= Date.now();

  async function payNow() {
    if (!idempotencyKey.trim()) {
      setFeedback("Idempotency-Key is required.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/payments/invoices/${invoice.id}/intent`, {
        method: "POST",
        headers: {
          "idempotency-key": idempotencyKey.trim(),
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | { replayed?: boolean; stripe_payment_intent_id?: string; message?: string; error_code?: string }
        | null;

      if (!response.ok) {
        setFeedback(payload?.message ?? payload?.error_code ?? "Payment intent creation failed.");
        return;
      }

      if (payload?.replayed) {
        setFeedback(`Payment intent replayed: ${payload?.stripe_payment_intent_id ?? "existing intent"}.`);
      } else {
        setFeedback(`Payment intent created: ${payload?.stripe_payment_intent_id ?? "ready"}.`);
      }
    } catch {
      setFeedback("Network error. Retry safely with the same key.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface-panel invoice-detail-layout">
      {isOverdue ? (
        <div className="danger-banner">
          Payment deadline exceeded. Deposit may be burned.
        </div>
      ) : null}

      <header className="section-heading">
        <h1>{invoice.lotTitle}</h1>
        <p>Invoice {invoice.id}</p>
      </header>

      <dl className="invoice-breakdown">
        <div>
          <dt>Winning amount</dt>
          <dd>{formatAed(invoice.winningAmountAed)}</dd>
        </div>
        <div>
          <dt>Commission</dt>
          <dd>{formatAed(invoice.commissionAed)}</dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>{formatAed(invoice.vatAed)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatAed(invoice.totalAed)}</dd>
        </div>
      </dl>

      <div className="invoice-deadline-box">
        <p>Due date: {formatLongDate(invoice.dueAt)}</p>
        {invoice.status === "ISSUED" ? (
          <LiveCountdown targetIso={invoice.dueAt} className="invoice-countdown" prefix="Time left" />
        ) : null}
        <p className={`deadline-pill tone-${tone}`}>{describeInvoiceDeadline(invoice.dueAt, invoice.status)}</p>
      </div>

      {invoice.status === "ISSUED" ? (
        <div className="invoice-pay-actions">
          <label>
            Idempotency-Key
            <input
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="inline-actions">
            <button type="button" className="button button-primary" onClick={() => void payNow()} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Pay Now"}
            </button>
            <button type="button" className="button button-ghost" onClick={() => setIdempotencyKey(createIdempotencyKey())}>
              Regenerate key
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? <p className="inline-note tone-info">{feedback}</p> : null}
    </section>
  );
}
