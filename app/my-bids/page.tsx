import { readMyBids } from "@/src/modules/ui/domain/marketplace_read_model";
import { BidWatchCards } from "@/src/modules/ui/transport/components/buyer/bid_watch_cards";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function MyBidsPage() {
  const items = await readMyBids();

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>My bids</h1>
          <p>Follow winning and outbid positions in real time.</p>
        </div>
      </section>

      <BidWatchCards items={items} mode="BIDS" />
    </MarketShell>
  );
}
