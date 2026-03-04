import { readWatchlist } from "@/src/modules/ui/domain/marketplace_read_model";
import { BidWatchCards } from "@/src/modules/ui/transport/components/buyer/bid_watch_cards";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function WatchlistPage() {
  const items = await readWatchlist();

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>Watchlist</h1>
          <p>Keep high-potential lots close and enter quickly when timing is right.</p>
        </div>
      </section>

      <BidWatchCards items={items} mode="WATCHLIST" />
    </MarketShell>
  );
}
