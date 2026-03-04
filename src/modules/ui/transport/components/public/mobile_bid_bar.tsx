import { formatAed } from "@/src/modules/ui/domain/marketplace_read_model";

type MobileBidBarProps = {
  currentBidAed: number;
  minimumNextBidAed: number;
  canBid: boolean;
};

export function MobileBidBar({ currentBidAed, minimumNextBidAed, canBid }: MobileBidBarProps) {
  if (!canBid) {
    return null;
  }

  return (
    <div className="mobile-bid-bar">
      <div>
        <p>Current</p>
        <strong>{formatAed(currentBidAed)}</strong>
      </div>
      <div>
        <p>Min next</p>
        <strong>{formatAed(minimumNextBidAed)}</strong>
      </div>
      <a href="#bid-module" className="button button-primary">
        Bid now
      </a>
    </div>
  );
}
