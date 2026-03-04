import Link from "next/link";
import { notFound } from "next/navigation";

import { readInvoiceDetail } from "@/src/modules/ui/domain/marketplace_read_model";
import { InvoiceDetailView } from "@/src/modules/ui/transport/components/finance/invoice_detail_view";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type InvoiceDetailPageProps = {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
};

export default async function FinanceInvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const resolvedParams = await Promise.resolve(params);
  const invoice = await readInvoiceDetail(resolvedParams.invoiceId);

  if (!invoice) {
    notFound();
  }

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>Invoice detail</h1>
          <p>Review totals and complete payment before policy deadline.</p>
        </div>
        <Link href="/finance" className="button button-ghost">
          Back to payment pending
        </Link>
      </section>

      <InvoiceDetailView invoice={invoice} />
    </MarketShell>
  );
}
