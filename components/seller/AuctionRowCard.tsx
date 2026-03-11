import Link from "next/link";

import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { formatAed, formatSellerDateTime } from "@/components/seller/utils";

type AuctionRow = {
  id: string;
  state: string;
  startingPriceAed: number;
  currentBidAed: number;
  bidsCount: number;
  endsAt: string;
  vehicleLabel: string;
};

type AuctionRowCardProps = {
  auction: AuctionRow;
  onAction: (auctionId: string, action: "publish" | "cancel") => void;
  busyActionId: string | null;
};

export function AuctionRowCard({ auction, onAction, busyActionId }: AuctionRowCardProps) {
  const normalizedState = auction.state.toUpperCase();

  return (
    <tr>
      <td>{auction.vehicleLabel}</td>
      <td>
        <AuctionStatusBadge state={normalizedState} />
      </td>
      <td>{formatAed(auction.startingPriceAed)}</td>
      <td>{formatAed(auction.currentBidAed)}</td>
      <td>{auction.bidsCount}</td>
      <td>{formatSellerDateTime(auction.endsAt)}</td>
      <td>
        <div className="seller-table-actions">
          {normalizedState === "DRAFT" ? (
            <>
              <Link href={`/seller/auctions/${auction.id}`} className="seller-inline-link">
                Edit
              </Link>
              <button
                type="button"
                className="seller-action-btn"
                onClick={() => onAction(auction.id, "publish")}
                disabled={busyActionId === auction.id}
              >
                Publish
              </button>
            </>
          ) : null}

          {normalizedState === "SCHEDULED" ? (
            <>
              <Link href={`/seller/auctions/${auction.id}`} className="seller-inline-link">
                View
              </Link>
              <button
                type="button"
                className="seller-action-btn seller-action-danger"
                onClick={() => onAction(auction.id, "cancel")}
                disabled={busyActionId === auction.id}
              >
                Cancel
              </button>
            </>
          ) : null}

          {normalizedState === "LIVE" || normalizedState === "EXTENDED" ? (
            <>
              <Link href={`/seller/auctions/${auction.id}`} className="seller-inline-link">
                View Live
              </Link>
              <span className="seller-bid-count-badge">{auction.bidsCount} bids</span>
            </>
          ) : null}

          {normalizedState !== "DRAFT" &&
          normalizedState !== "SCHEDULED" &&
          normalizedState !== "LIVE" &&
          normalizedState !== "EXTENDED" ? (
            <Link href={`/seller/auctions/${auction.id}`} className="seller-inline-link">
              View Results
            </Link>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
