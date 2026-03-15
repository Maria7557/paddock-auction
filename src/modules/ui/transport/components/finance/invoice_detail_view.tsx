"use client";

import { useState } from "react";

import type { SupportedLocale } from "@/src/i18n/routing";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
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
  locale: SupportedLocale;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function InvoiceDetailView({ invoice, locale }: InvoiceDetailViewProps) {
  const t = getBuyerPortalCopy(locale);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const tone = getInvoiceDeadlineTone(invoice.dueAt, invoice.status);
  const isOverdue = tone === "critical" && new Date(invoice.dueAt).getTime() <= Date.now();

  async function payNow() {
    if (!idempotencyKey.trim()) {
      setFeedback(t.invoiceDetail.idempotencyRequired);
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
        setFeedback(payload?.message ?? payload?.error_code ?? t.invoiceDetail.intentCreationFailed);
        return;
      }

      if (payload?.replayed) {
        setFeedback(`${t.invoiceDetail.intentReplayed}: ${payload?.stripe_payment_intent_id ?? t.invoiceDetail.existingIntentFallback}.`);
      } else {
        setFeedback(`${t.invoiceDetail.intentCreated}: ${payload?.stripe_payment_intent_id ?? t.invoiceDetail.readyFallback}.`);
      }
    } catch {
      setFeedback(t.invoiceDetail.networkRetry);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface-panel invoice-detail-layout">
      {isOverdue ? (
        <div className="danger-banner">
          {t.invoiceDetail.overdueBanner}
        </div>
      ) : null}

      <header className="section-heading">
        <h1>{invoice.lotTitle}</h1>
        <p>{t.invoiceDetail.invoiceLabel} {invoice.id}</p>
      </header>

      <dl className="invoice-breakdown">
        <div>
          <dt>{t.invoiceDetail.winningAmount}</dt>
          <dd>{formatAed(invoice.winningAmountAed, locale)}</dd>
        </div>
        <div>
          <dt>{t.invoiceDetail.commission}</dt>
          <dd>{formatAed(invoice.commissionAed, locale)}</dd>
        </div>
        <div>
          <dt>{t.invoiceDetail.vat}</dt>
          <dd>{formatAed(invoice.vatAed, locale)}</dd>
        </div>
        <div>
          <dt>{t.invoiceDetail.total}</dt>
          <dd>{formatAed(invoice.totalAed, locale)}</dd>
        </div>
      </dl>

      <div className="invoice-deadline-box">
        <p>{t.invoiceDetail.dueDate}: {formatLongDate(invoice.dueAt, locale)}</p>
        {invoice.status === "ISSUED" ? (
          <LiveCountdown targetIso={invoice.dueAt} className="invoice-countdown" prefix={t.invoiceDetail.timeLeft} />
        ) : null}
        <p className={`deadline-pill tone-${tone}`}>{describeInvoiceDeadline(invoice.dueAt, invoice.status, undefined, locale)}</p>
      </div>

      {invoice.status === "ISSUED" ? (
        <div className="invoice-pay-actions">
          <label>
            {t.invoiceDetail.idempotencyKey}
            <input
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="inline-actions">
            <button type="button" className="button button-primary" onClick={() => void payNow()} disabled={isSubmitting}>
              {isSubmitting ? t.invoiceDetail.submitting : t.invoiceDetail.payNow}
            </button>
            <button type="button" className="button button-ghost" onClick={() => setIdempotencyKey(createIdempotencyKey())}>
              {t.invoiceDetail.regenerateKey}
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? <p className="inline-note tone-info">{feedback}</p> : null}
    </section>
  );
}
