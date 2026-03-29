import Link from "next/link";

import type { SupportedLocale } from "@/src/i18n/routing";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import {
  describeInvoiceDeadline,
  formatAed,
  formatShortDateTime,
  getInvoiceDeadlineTone,
  type InvoiceSummaryViewModel,
} from "@/src/modules/ui/domain/invoice_presentation";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";

type InvoiceCardsProps = {
  invoices: InvoiceSummaryViewModel[];
  locale: SupportedLocale;
};

export function InvoiceCards({ invoices, locale }: InvoiceCardsProps) {
  const t = getBuyerPortalCopy(locale);

  return (
    <section className="cards-stack" aria-label={t.invoices.aria}>
      {invoices.map((invoice) => {
        const tone = getInvoiceDeadlineTone(invoice.dueAt, invoice.status);

        return (
          <article key={invoice.id} className="invoice-card">
            <div>
              <p className="card-eyebrow">{invoice.lotNumber}</p>
              <h3>{invoice.lotTitle}</h3>
              <p className="text-muted">{t.invoices.invoiceLabel} {invoice.id}</p>
            </div>

            <div className="invoice-values">
              <p>
                {t.invoices.total}: <strong>{formatAed(invoice.totalAed, locale)}</strong>
              </p>
              <p>{t.invoices.due}: {formatShortDateTime(invoice.dueAt, locale)}</p>
              <p className={`deadline-pill tone-${tone}`}>{describeInvoiceDeadline(invoice.dueAt, invoice.status, undefined, locale)}</p>
              {invoice.status === "ISSUED" ? (
                <LiveCountdown targetIso={invoice.dueAt} prefix={t.invoices.countdown} className="small-countdown" />
              ) : null}
            </div>

            <Link href={`/finance/invoices/${invoice.id}`} className="button button-ghost">
              {t.invoices.openInvoice}
            </Link>
          </article>
        );
      })}
    </section>
  );
}
