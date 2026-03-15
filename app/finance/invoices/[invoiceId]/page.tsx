import Link from "next/link";
import { notFound } from "next/navigation";

import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { readInvoiceDetail } from "@/src/modules/ui/domain/marketplace_read_model";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { InvoiceDetailView } from "@/src/modules/ui/transport/components/finance/invoice_detail_view";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type InvoiceDetailPageProps = {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
};

export default async function FinanceInvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const resolvedParams = await Promise.resolve(params);
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const session = await requireBuyerSession(`/finance/invoices/${resolvedParams.invoiceId}`);
  const invoice = await readInvoiceDetail(resolvedParams.invoiceId, {
    companyId: session.companyId,
  });

  if (!invoice) {
    notFound();
  }

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.invoiceDetailTitle}</h1>
          <p>{t.pages.invoiceDetailSubtitle}</p>
        </div>
        <Link href="/finance" className="button button-ghost">
          {t.pages.backToPaymentPending}
        </Link>
      </section>

      <InvoiceDetailView invoice={invoice} locale={locale} />
    </MarketShell>
  );
}
