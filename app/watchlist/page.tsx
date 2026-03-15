import { readWatchlist } from "@/src/modules/ui/domain/marketplace_read_model";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { BidWatchCards } from "@/src/modules/ui/transport/components/buyer/bid_watch_cards";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function WatchlistPage() {
  const session = await requireBuyerSession("/watchlist");
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const items = await readWatchlist({
    userId: session.userId,
  });

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.watchlistTitle}</h1>
          <p>{t.pages.watchlistSubtitle}</p>
        </div>
      </section>

      <BidWatchCards items={items} mode="WATCHLIST" locale={locale} />
    </MarketShell>
  );
}
