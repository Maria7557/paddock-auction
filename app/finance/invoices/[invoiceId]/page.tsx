import { BuyerAccountBanner } from "@/components/buyer/BuyerAccountBanner";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, api } from "@/src/lib/api-client";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";
import type { InvoiceDetailViewModel, InvoiceStatus } from "@/src/modules/ui/domain/invoice_presentation";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { InvoiceDetailView } from "@/src/modules/ui/transport/components/finance/invoice_detail_view";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type InvoiceDetailPageProps = {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
};

type FinanceInvoiceDetailResponse = {
  invoice: {
    id: string;
    invoiceId: string;
    auctionId: string;
    lotNumber: string;
    lotTitle: string;
    winningBid: number;
    commission: number;
    vat: number;
    docFee: number;
    total: number;
    status: InvoiceStatus;
    issuedAt: string;
    dueAt: string;
  };
};

export default async function FinanceInvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const resolvedParams = await Promise.resolve(params);
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const session = await requireBuyerSession(`/finance/invoices/${resolvedParams.invoiceId}`);
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const invoiceResponse = await api.finance.invoices
    .get<FinanceInvoiceDetailResponse>(resolvedParams.invoiceId, requestOptions)
    .catch((error) => {
      if (error instanceof ApiError && error.statusCode === 404) {
        return null;
      }

      throw error;
    });

  if (!invoiceResponse) {
    notFound();
  }

  const winnerCompany = session.companyName?.trim() || "Buyer company";
  const invoice: InvoiceDetailViewModel = {
    id: invoiceResponse.invoice.id,
    auctionId: invoiceResponse.invoice.auctionId,
    lotNumber: invoiceResponse.invoice.lotNumber,
    lotTitle: invoiceResponse.invoice.lotTitle,
    winnerCompany,
    winningAmountAed: invoiceResponse.invoice.winningBid,
    commissionAed: invoiceResponse.invoice.commission,
    vatAed: invoiceResponse.invoice.vat,
    totalAed: invoiceResponse.invoice.total,
    issuedAt: invoiceResponse.invoice.issuedAt,
    dueAt: invoiceResponse.invoice.dueAt,
    status: invoiceResponse.invoice.status,
    stripePaymentIntentId: null,
  };

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.invoiceDetailTitle}</h1>
          <p>{t.pages.invoiceDetailSubtitle}</p>
        </div>
        <BuyerAccountBanner userStatus={session.userStatus} companyStatus={session.companyStatus} />
        <Link href="/finance" className="button button-ghost">
          {t.pages.backToPaymentPending}
        </Link>
      </section>

      <InvoiceDetailView invoice={invoice} locale={locale} />
    </MarketShell>
  );
}
