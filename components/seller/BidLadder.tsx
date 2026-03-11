import { formatAed, formatSellerDateTime } from "@/components/seller/utils";

type BidRow = {
  id: string;
  rank: number;
  companyName: string;
  amountAed: number;
  createdAt: string;
};

type BidLadderProps = {
  bids: BidRow[];
};

export function BidLadder({ bids }: BidLadderProps) {
  return (
    <section className="surface-panel seller-section-block">
      <h2>Bid Ladder</h2>

      <div className="seller-table-scroll">
        <table className="seller-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Company</th>
              <th>Amount</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {bids.map((bid) => (
              <tr key={bid.id}>
                <td>#{bid.rank}</td>
                <td>{bid.companyName}</td>
                <td>{formatAed(bid.amountAed)}</td>
                <td>{formatSellerDateTime(bid.createdAt)}</td>
              </tr>
            ))}
            {bids.length === 0 ? (
              <tr>
                <td colSpan={4} className="seller-empty-cell">
                  No bids yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
