import { BuyerAccountBanner } from "@/components/buyer/BuyerAccountBanner";
import { readWallet } from "@/src/modules/ui/domain/marketplace_read_model";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { WalletOverview } from "@/src/modules/ui/transport/components/buyer/wallet_overview";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function WalletPage() {
  const session = await requireBuyerSession("/wallet");
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const wallet = await readWallet({
    userId: session.userId,
  });

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.walletTitle}</h1>
          <p>{t.pages.walletSubtitle}</p>
        </div>
        <BuyerAccountBanner userStatus={session.userStatus} companyStatus={session.companyStatus} />
      </section>

      <WalletOverview wallet={wallet} locale={locale} />
    </MarketShell>
  );
}
