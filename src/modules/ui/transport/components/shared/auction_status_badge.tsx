import { type AuctionStatus, getStatusLabel } from "@/src/modules/ui/domain/marketplace_read_model";

type AuctionStatusBadgeProps = {
  status: AuctionStatus;
};

export function AuctionStatusBadge({ status }: AuctionStatusBadgeProps) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{getStatusLabel(status)}</span>;
}
