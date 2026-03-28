"use client";

import { useEffect, useState } from "react";

import { api, getApiErrorMessage } from "@/src/lib/api-client";
import type { SupportedLocale } from "@/src/i18n/routing";
import {
  describeInvoiceDeadline,
  formatAed,
  formatShortDateTime,
  getInvoiceDeadlineTone,
  type PaymentPendingInvoiceViewModel,
} from "@/src/modules/ui/domain/invoice_presentation";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";

type PaymentPendingViewProps = {
  invoices: PaymentPendingInvoiceViewModel[];
  locale: SupportedLocale;
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

export function PaymentPendingView({ invoices, locale }: PaymentPendingViewProps) {
  const t = getBuyerPortalCopy(locale);
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
      setFeedback((current) => ({ ...current, [invoiceId]: t.paymentPending.idempotencyRequired }));
      return;
    }

    setPending((current) => ({ ...current, [invoiceId]: true }));
    setFeedback((current) => ({ ...current, [invoiceId]: undefined }));

    try {
      const payload = await api.payments.invoice.createIntent<{
        replayed?: boolean;
        stripe_payment_intent_id?: string;
        message?: string;
        error_code?: string;
      }>(invoiceId, idempotencyKey);

      const statusLabel = payload?.replayed ? t.paymentPending.intentReplayed : t.paymentPending.intentCreated;
      const intentLabel = payload?.stripe_payment_intent_id ? ` ${payload.stripe_payment_intent_id}` : "";

      setFeedback((current) => ({
        ...current,
        [invoiceId]: `${statusLabel}${intentLabel}`,
      }));
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [invoiceId]: getApiErrorMessage(error, t.paymentPending.networkRetry),
      }));
    } finally {
      setPending((current) => ({ ...current, [invoiceId]: false }));
    }
  }

  return (
    <section className="surface-panel">
      <div className="section-heading">
        <h2>{t.paymentPending.title}</h2>
        <p>{t.paymentPending.subtitle}</p>
      </div>

      <div className="cards-stack" aria-label={t.paymentPending.aria}>
        {issued.map((invoice) => {
          const tone = getInvoiceDeadlineTone(invoice.dueAt, invoice.status);
          const invoiceFeedback = feedback[invoice.id];

          return (
            <article key={invoice.id} className="finance-card">
              <div>
                <p className="card-eyebrow">{invoice.lotNumber}</p>
                <h3>{invoice.lotTitle}</h3>
                <p className="text-muted">
                  {t.paymentPending.winner}: {invoice.winnerCompany}
                </p>
              </div>

              <div className="finance-card-values">
                <p>
                  {t.paymentPending.total}: <strong>{formatAed(invoice.totalAed, locale)}</strong>
                </p>
                <p>
                  {t.paymentPending.due}: {formatShortDateTime(invoice.dueAt, locale)}
                </p>
                <p className={`deadline-pill tone-${tone}`}>
                  {describeInvoiceDeadline(invoice.dueAt, invoice.status, undefined, locale)}
                </p>
                <LiveCountdown targetIso={invoice.dueAt} prefix={t.paymentPending.countdown} className="small-countdown" />
              </div>

              <label>
                {t.paymentPending.idempotencyKey}
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
                  {pending[invoice.id] ? t.paymentPending.submitting : t.paymentPending.payNow}
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
                  {t.paymentPending.regenerateKey}
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
