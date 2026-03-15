import { readInvoices } from "@/src/modules/ui/domain/marketplace_read_model";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { InvoiceCards } from "@/src/modules/ui/transport/components/buyer/invoice_cards";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function InvoicesPage() {
  const session = await requireBuyerSession("/invoices");
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const invoices = await readInvoices({
    companyId: session.companyId,
  });

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.invoicesTitle}</h1>
          <p>{t.pages.invoicesSubtitle}</p>
        </div>
      </section>

      <InvoiceCards invoices={invoices} locale={locale} />
    </MarketShell>
  );
}
