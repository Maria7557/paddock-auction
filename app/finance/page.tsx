import { readInvoices } from "@/src/modules/ui/domain/marketplace_read_model";
import { PaymentPendingView } from "@/src/modules/ui/transport/components/finance/payment_pending_view";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function FinancePage() {
  const invoices = await readInvoices();

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>Payment pending view</h1>
          <p>Complete winner payments on time to avoid default and deposit burn consequences.</p>
        </div>
      </section>

      <PaymentPendingView invoices={invoices} />
    </MarketShell>
  );
}
