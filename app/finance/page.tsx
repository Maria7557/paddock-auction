import { BuyerAccountBanner } from "@/components/buyer/BuyerAccountBanner";
import { api } from "@/src/lib/api-client";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";
import type { InvoiceStatus, PaymentPendingInvoiceViewModel } from "@/src/modules/ui/domain/invoice_presentation";
import { PaymentPendingView } from "@/src/modules/ui/transport/components/finance/payment_pending_view";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type FinanceInvoicesResponse = {
  invoices: Array<{
    id: string;
    invoiceId: string;
    auctionId: string;
    lotNumber: string;
    lotTitle: string;
    total: number;
    status: InvoiceStatus;
    issuedAt: string;
    dueAt: string;
  }>;
};

export default async function FinancePage() {
  const session = await requireBuyerSession("/finance");
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const companyName = session.companyName?.trim() || "Buyer company";
  const invoicesResponse = await api.finance.invoices.list<FinanceInvoicesResponse>(requestOptions);
  const invoices: PaymentPendingInvoiceViewModel[] = invoicesResponse.invoices.map((invoice) => ({
    id: invoice.id,
    auctionId: invoice.auctionId,
    lotNumber: invoice.lotNumber,
    lotTitle: invoice.lotTitle,
    winnerCompany: companyName,
    totalAed: invoice.total,
    dueAt: invoice.dueAt,
    status: invoice.status,
  }));

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.paymentPendingTitle}</h1>
          <p>{t.pages.paymentPendingSubtitle}</p>
        </div>
        <BuyerAccountBanner userStatus={session.userStatus} companyStatus={session.companyStatus} />
      </section>

      <PaymentPendingView invoices={invoices} locale={locale} />
    </MarketShell>
  );
}
