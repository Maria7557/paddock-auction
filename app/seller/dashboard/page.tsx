import Link from "next/link";

import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { MetricTile } from "@/components/seller/MetricTile";
import { SellerTabs } from "@/components/seller/SellerTabs";
import { formatAed, formatSellerDateTime } from "@/components/seller/utils";
import prisma from "@/src/infrastructure/database/prisma";
import { requireSellerSession } from "@/src/lib/seller_session";

export const dynamic = "force-dynamic";

function decimalLikeToNumber(value: { toString(): string } | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function SellerDashboardPage() {
  const session = await requireSellerSession("/seller/dashboard");

  const [distinctVehicles, draftAuctions, liveAuctions, soldAuctions, recentAuctions] = await Promise.all([
    prisma.auction.findMany({
      where: { sellerCompanyId: session.companyId },
      distinct: ["vehicleId"],
      select: { vehicleId: true },
    }),
    prisma.auction.count({
      where: {
        sellerCompanyId: session.companyId,
        state: "DRAFT",
      },
    }),
    prisma.auction.count({
      where: {
        sellerCompanyId: session.companyId,
        state: "LIVE",
      },
    }),
    prisma.auction.count({
      where: {
        sellerCompanyId: session.companyId,
        state: "ENDED",
        highestBidId: {
          not: null,
        },
      },
    }),
    prisma.auction.findMany({
      where: {
        sellerCompanyId: session.companyId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 10,
      include: {
        vehicle: {
          select: {
            brand: true,
            model: true,
            year: true,
          },
        },
      },
    }),
  ]);

  return (
    <section className="seller-section-stack">
      <SellerTabs />

      <section className="seller-metrics-row">
        <MetricTile label="Total Vehicles" value={distinctVehicles.length} />
        <MetricTile label="Draft Auctions" value={draftAuctions} />
        <MetricTile label="Live Auctions" value={liveAuctions} />
        <MetricTile label="Sold" value={soldAuctions} />
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
                <th>Starting Price</th>
                <th>Starts At</th>
                <th>Ends At</th>
              </tr>
            </thead>
            <tbody>
              {recentAuctions.map((auction) => (
                <tr key={auction.id}>
                  <td>{auction.vehicle ? `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}` : auction.vehicleId}</td>
                  <td>
                    <AuctionStatusBadge state={auction.state} />
                  </td>
                  <td>{formatAed(decimalLikeToNumber(auction.startingPrice ?? auction.currentPrice))}</td>
                  <td>{formatSellerDateTime(auction.startsAt)}</td>
                  <td>{formatSellerDateTime(auction.endsAt)}</td>
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
