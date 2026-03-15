import { BuyerAccountBanner } from "@/components/buyer/BuyerAccountBanner";
import { readMyBids } from "@/src/modules/ui/domain/marketplace_read_model";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { BidWatchCards } from "@/src/modules/ui/transport/components/buyer/bid_watch_cards";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function MyBidsPage() {
  const session = await requireBuyerSession("/my-bids");
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const items = await readMyBids({
    userId: session.userId,
  });

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.myBidsTitle}</h1>
          <p>{t.pages.myBidsSubtitle}</p>
        </div>
        <BuyerAccountBanner userStatus={session.userStatus} companyStatus={session.companyStatus} />
      </section>

      <BidWatchCards items={items} mode="BIDS" locale={locale} />
    </MarketShell>
  );
}
