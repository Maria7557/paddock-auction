import { Badge, getBadgeToneFromStatus } from "@/components/ui/Badge";
import type { SupportedLocale } from "@/src/i18n/routing";

import { type AuctionStatus, getStatusLabel } from "@/src/modules/ui/domain/marketplace_read_model";

type AuctionStatusBadgeProps = {
  status: AuctionStatus;
  locale?: SupportedLocale;
};

export function AuctionStatusBadge({ status, locale = "en" }: AuctionStatusBadgeProps) {
  return <Badge tone={getBadgeToneFromStatus(status)}>{getStatusLabel(status, locale)}</Badge>;
}
