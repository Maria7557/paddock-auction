import Link from "next/link";

import {
  describeInvoiceDeadline,
  formatAed,
  formatShortDateTime,
  getInvoiceDeadlineTone,
  type InvoiceReadModel,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";

type InvoiceCardsProps = {
  invoices: InvoiceReadModel[];
};

export function InvoiceCards({ invoices }: InvoiceCardsProps) {
  return (
    <section className="cards-stack" aria-label="Invoices">
      {invoices.map((invoice) => {
        const tone = getInvoiceDeadlineTone(invoice.dueAt, invoice.status);

        return (
          <article key={invoice.id} className="invoice-card">
            <div>
              <p className="card-eyebrow">{invoice.lotNumber}</p>
              <h3>{invoice.lotTitle}</h3>
              <p className="text-muted">Invoice {invoice.id}</p>
            </div>

            <div className="invoice-values">
              <p>
                Total: <strong>{formatAed(invoice.totalAed)}</strong>
              </p>
              <p>Due: {formatShortDateTime(invoice.dueAt)}</p>
              <p className={`deadline-pill tone-${tone}`}>{describeInvoiceDeadline(invoice.dueAt, invoice.status)}</p>
              {invoice.status === "ISSUED" ? (
                <LiveCountdown targetIso={invoice.dueAt} prefix="Countdown" className="small-countdown" />
              ) : null}
            </div>

            <Link href={`/finance/invoices/${invoice.id}`} className="button button-ghost">
              Open invoice
            </Link>
          </article>
        );
      })}
    </section>
  );
}
