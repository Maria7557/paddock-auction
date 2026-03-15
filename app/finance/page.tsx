import { BuyerAccountBanner } from "@/components/buyer/BuyerAccountBanner";
import { readInvoices } from "@/src/modules/ui/domain/marketplace_read_model";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { PaymentPendingView } from "@/src/modules/ui/transport/components/finance/payment_pending_view";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function FinancePage() {
  const session = await requireBuyerSession("/finance");
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const invoices = await readInvoices({
    companyId: session.companyId,
  });

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
