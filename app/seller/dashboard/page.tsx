import Link from "next/link";

import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { MetricTile } from "@/components/seller/MetricTile";
import { SellerTabs } from "@/components/seller/SellerTabs";
import { formatSellerAuctionBid, formatSellerDateTime } from "@/components/seller/utils";
import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";
import { requireSellerSession } from "@/src/lib/seller_session";

export const dynamic = "force-dynamic";

export default async function SellerDashboardPage() {
  await requireSellerSession("/seller/dashboard");
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const dashboard = await api.seller.dashboard<{
    metrics?: {
      totalVehicles?: number;
      activeLots?: number;
      completedLots?: number;
      revenue?: number;
    };
  }>(requestOptions);
  const recentAuctionsPayload = await api.seller.auctions.list<{
      auctions?: Array<{
        id: string;
        state: string;
        vehicleLabel: string;
        currentPrice: number;
        startsAt: string;
        endsAt: string;
      }>;
  }>({ sort: "newest" }, requestOptions).catch((error) => {
    console.error("Failed to load seller auctions for dashboard", error);

    return {
      auctions: [],
    };
  });
  const metrics = dashboard.metrics ?? {};
  const allAuctions = recentAuctionsPayload.auctions ?? [];
  const recentAuctions = allAuctions.slice(0, 10);
  const draftAuctions = allAuctions.filter((auction) => auction.state === "DRAFT").length;
  const liveAuctions = allAuctions.filter((auction) => auction.state === "LIVE" || auction.state === "EXTENDED").length;

  return (
    <section className="seller-section-stack">
      <SellerTabs />

      <section className="seller-metrics-row">
        <MetricTile label="Total Vehicles" value={metrics.totalVehicles ?? 0} />
        <MetricTile label="Draft Auctions" value={draftAuctions} />
        <MetricTile label="Live Auctions" value={liveAuctions} />
        <MetricTile label="Sold" value={metrics.completedLots ?? 0} />
      </section>

      <section className="surface-panel seller-section-block">
        <div className="seller-section-head">
          <h2>Recent Auctions</h2>
          <Link href="/seller/auctions" className="seller-inline-link">
            View all
          </Link>
        </div>

        <div className="seller-table-scroll">
          <table className="seller-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>State</th>
                <th>Current Bid</th>
                <th>Starts At</th>
                <th>Ends At</th>
              </tr>
            </thead>
            <tbody>
              {recentAuctions.map((auction) => (
                <tr key={auction.id}>
                  <td>{auction.vehicleLabel}</td>
                  <td>
                    <AuctionStatusBadge state={auction.state} />
                  </td>
                  <td>{formatSellerAuctionBid(auction.currentPrice)}</td>
                  <td>{formatSellerDateTime(new Date(auction.startsAt))}</td>
                  <td>{formatSellerDateTime(new Date(auction.endsAt))}</td>
                </tr>
              ))}
              {recentAuctions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="seller-empty-cell">
                    No auctions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
