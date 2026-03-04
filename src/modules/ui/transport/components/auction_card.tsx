import Link from "next/link";

import {
  type AuctionReadModel,
  formatAed,
  formatCompactDateTime,
  getAuctionStatusLabel,
} from "../../domain/mvp_read_model_stub";
import { StatusChip } from "./status_chip";

type AuctionCardProps = {
  auction: AuctionReadModel;
};

function mapAuctionTone(
  status: AuctionReadModel["status"],
): "live" | "scheduled" | "warning" | "resolved" | "critical" | "neutral" {
  switch (status) {
    case "LIVE":
      return "live";
    case "SCHEDULED":
      return "scheduled";
    case "PAYMENT_PENDING":
      return "warning";
    case "PAID":
      return "resolved";
    case "DEFAULTED":
      return "critical";
    default:
      return "neutral";
  }
}

export function AuctionCard({ auction }: AuctionCardProps) {
  return (
    <article className="auction-card">
      <header className="auction-card-head">
        <StatusChip label={getAuctionStatusLabel(auction.status)} tone={mapAuctionTone(auction.status)} />
        <span className="lot-code">{auction.lotCode}</span>
      </header>

      <h3>{auction.title}</h3>
      <p className="text-muted">
        {auction.year} · {auction.mileageKm.toLocaleString("en-US")} km · {auction.fuel} · {auction.drivetrain}
      </p>
      <p className="text-muted">{auction.location}</p>

      <dl className="auction-card-metrics">
        <div>
          <dt>Current bid</dt>
          <dd>{formatAed(auction.currentBidAed)}</dd>
        </div>
        <div>
          <dt>Minimum step</dt>
          <dd>{formatAed(auction.minIncrementAed)}</dd>
        </div>
        <div>
          <dt>Seller</dt>
          <dd>{auction.seller}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{formatCompactDateTime(auction.endsAt)}</dd>
        </div>
      </dl>

      <div className="card-actions">
        <Link href={`/auctions/${auction.id}`} className="button button-ghost">
          Open lot desk
        </Link>
      </div>
    </article>
  );
}
