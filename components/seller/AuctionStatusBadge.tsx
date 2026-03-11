import type { AuctionState } from "@prisma/client";

type AuctionStatusBadgeProps = {
  state: AuctionState | string;
};

function normalize(state: string): string {
  const upper = state.toUpperCase();

  if (upper === "EXTENDED") {
    return "LIVE";
  }

  if (upper === "PAID" || upper === "CLOSED") {
    return "ENDED";
  }

  return upper;
}

export function AuctionStatusBadge({ state }: AuctionStatusBadgeProps) {
  const normalized = normalize(state);

  if (normalized === "LIVE") {
    return (
      <span className="seller-status seller-status-live">
        <span className="seller-live-dot" aria-hidden="true" />
        LIVE
      </span>
    );
  }

  if (normalized === "SCHEDULED") {
    return <span className="seller-status seller-status-scheduled">SCHEDULED</span>;
  }

  if (normalized === "DRAFT") {
    return <span className="seller-status seller-status-draft">DRAFT</span>;
  }

  if (normalized === "PAYMENT_PENDING") {
    return <span className="seller-status seller-status-payment">PAYMENT_PENDING</span>;
  }

  if (normalized === "CANCELED") {
    return <span className="seller-status seller-status-canceled">CANCELED</span>;
  }

  return <span className="seller-status seller-status-ended">ENDED</span>;
}
