import { readInvoices } from "@/src/modules/ui/domain/marketplace_read_model";
import { InvoiceCards } from "@/src/modules/ui/transport/components/buyer/invoice_cards";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function InvoicesPage() {
  const invoices = await readInvoices();

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>Invoices</h1>
          <p>Track due invoices and resolve payment actions before the 48h deadline.</p>
        </div>
      </section>

      <InvoiceCards invoices={invoices} />
    </MarketShell>
  );
}
