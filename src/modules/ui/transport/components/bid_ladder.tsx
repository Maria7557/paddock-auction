import { type BidLadderEntryReadModel, formatAed, formatCompactDateTime } from "../../domain/mvp_read_model_stub";

type BidLadderProps = {
  entries: BidLadderEntryReadModel[];
};

export function BidLadder({ entries }: BidLadderProps) {
  return (
    <section className="surface-panel">
      <div className="section-heading">
        <h2>Bid ladder</h2>
        <p className="text-muted">Latest accepted bids (descending sequence)</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted">No bids yet. First accepted bid must pass deposit lock checks.</p>
      ) : (
        <div className="ladder-list" role="list" aria-label="Latest bids">
          {entries
            .slice()
            .sort((left, right) => right.sequenceNo - left.sequenceNo)
            .map((entry) => (
              <article className="ladder-row" key={entry.id} role="listitem">
                <div>
                  <p className="ladder-sequence">#{entry.sequenceNo}</p>
                  <p className="ladder-company">{entry.companyAlias}</p>
                </div>
                <div className="ladder-right">
                  <p className="ladder-amount">{formatAed(entry.amountAed)}</p>
                  <p className="text-muted">{formatCompactDateTime(entry.placedAt)}</p>
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
