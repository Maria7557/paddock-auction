import { Badge, getBadgeToneFromStatus } from "@/components/ui/Badge";

import { type AuctionStatus, getStatusLabel } from "@/src/modules/ui/domain/marketplace_read_model";

type AuctionStatusBadgeProps = {
  status: AuctionStatus;
};

export function AuctionStatusBadge({ status }: AuctionStatusBadgeProps) {
  return <Badge tone={getBadgeToneFromStatus(status)}>{getStatusLabel(status)}</Badge>;
}
