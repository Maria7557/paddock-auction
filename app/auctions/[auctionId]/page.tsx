import { notFound } from "next/navigation";

import {
  formatAed,
  formatLongDate,
  readAuctionDetail,
  readBidHistory,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { AuctionDetailTabs } from "@/src/modules/ui/transport/components/public/auction_detail_tabs";
import { AuctionGallery } from "@/src/modules/ui/transport/components/public/auction_gallery";
import { LiveBidHistory } from "@/src/modules/ui/transport/components/public/live_bid_history";
import { MobileBidBar } from "@/src/modules/ui/transport/components/public/mobile_bid_bar";
import { SellerTrustPanel } from "@/src/modules/ui/transport/components/public/seller_trust_panel";
import { StickyBidModule } from "@/src/modules/ui/transport/components/public/sticky_bid_module";
import { AuctionStatusBadge } from "@/src/modules/ui/transport/components/shared/auction_status_badge";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type AuctionDetailPageProps = {
  params: Promise<{ auctionId: string }> | { auctionId: string };
};

export default async function AuctionDetailPage({ params }: AuctionDetailPageProps) {
  const resolvedParams = await Promise.resolve(params);
  const lot = await readAuctionDetail(resolvedParams.auctionId);

  if (!lot) {
    notFound();
  }

  const bidHistory = await readBidHistory(lot.id);
  const minimumNextBid = lot.currentBidAed + lot.minimumStepAed;
  const canBid = lot.status === "LIVE";

  return (
    <MarketShell>
      <section className="detail-top">
        <div>
          <p className="hero-kicker">{lot.lotNumber}</p>
          <h1>{lot.title}</h1>
          <p className="hero-subtext">
            {lot.year} / {lot.mileageKm.toLocaleString("en-US")} KM / {lot.location}
          </p>
        </div>
        <AuctionStatusBadge status={lot.status} />
      </section>

      <section className="detail-layout-v2">
        <div className="detail-main-col">
          <AuctionGallery images={lot.images} title={lot.title} />

          <section className="surface-panel">
            <h2>Lot highlights</h2>
            <div className="spec-headline-grid">
              <article>
                <p>Current bid</p>
                <strong>{formatAed(lot.currentBidAed)}</strong>
              </article>
              <article>
                <p>Minimum next bid</p>
                <strong>{formatAed(minimumNextBid)}</strong>
              </article>
              <article>
                <p>Minimum step</p>
                <strong>{formatAed(lot.minimumStepAed)}</strong>
              </article>
              <article>
                <p>Auction ends</p>
                <strong>{formatLongDate(lot.endsAt)}</strong>
              </article>
            </div>
          </section>

          <AuctionDetailTabs
            specs={lot.specs}
            inspectionSummary={lot.inspectionSummary}
            documents={lot.documents}
            seller={lot.seller}
            sellerNotes={lot.sellerNotes}
            bidHistory={bidHistory}
          />

          <LiveBidHistory auctionId={lot.id} initialEntries={bidHistory} />
        </div>

        <aside className="detail-side-col">
          <StickyBidModule
            auctionId={lot.id}
            initialCurrentBidAed={lot.currentBidAed}
            minimumStepAed={lot.minimumStepAed}
            initialEndsAt={lot.endsAt}
            depositRequiredAed={lot.depositRequiredAed}
            depositReady={lot.depositReady}
          />
          <SellerTrustPanel lot={lot} />
        </aside>
      </section>

      <MobileBidBar currentBidAed={lot.currentBidAed} minimumNextBidAed={minimumNextBid} canBid={canBid} />
    </MarketShell>
  );
}
