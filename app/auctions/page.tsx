import { readAuctionListing } from "@/src/modules/ui/domain/marketplace_read_model";
import { AuctionFilterSidebar } from "@/src/modules/ui/transport/components/public/auction_filter_sidebar";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function AuctionsPage() {
  const lots = await readAuctionListing();

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>Browse UAE auction inventory</h1>
          <p>Filter live and upcoming lots by status, location, seller, and value range.</p>
        </div>
      </section>

      <AuctionFilterSidebar lots={lots} />
    </MarketShell>
  );
}
