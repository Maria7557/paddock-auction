import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { releaseAuctionBidsFromBuyingPower } from "../../deposits/application/deposit_commands";

type Decimal = Prisma.Decimal;
type TxClient = Prisma.TransactionClient;

type AuctionBidRow = {
  id: string;
  company_id: string;
  amount: Decimal;
  sequence_no: number;
  created_at: Date;
};

export type AuctionCloseBuyingPowerOutcome = {
  auctionId: string;
  winningBidId: string | null;
  winnerCompanyId: string | null;
  winningBidAmount: Decimal | null;
  losingCompanyIds: string[];
  bidAmountsByCompany: Map<string, Decimal>;
  releasableLosingCompanyIds: string[];
  releasableBidAmountsByCompany: Map<string, Decimal>;
};

async function enqueueAuctionOutboxEvent(
  tx: TxClient,
  input: {
    auctionId: string;
    eventType: "AUCTION_CLOSED" | "WINNER_DETERMINED" | "LOSING_BIDS_RELEASED";
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      id: randomUUID(),
      aggregateType: "AUCTION",
      aggregateId: input.auctionId,
      eventType: input.eventType,
      partitionKey: input.auctionId,
      payload: {
        type: input.eventType,
        auctionId: input.auctionId,
        ...input.payload,
      },
    },
  });
}

export async function collectAuctionCloseBuyingPowerOutcome(
  tx: TxClient,
  auctionId: string,
): Promise<AuctionCloseBuyingPowerOutcome> {
  const bidRows = await tx.$queryRaw<AuctionBidRow[]>`
    SELECT
      id,
      company_id,
      amount,
      sequence_no,
      created_at
    FROM bids
    WHERE auction_id = ${auctionId}
    ORDER BY amount DESC, sequence_no DESC, created_at DESC, id DESC
  `;

  if (bidRows.length === 0) {
    return {
      auctionId,
      winningBidId: null,
      winnerCompanyId: null,
      winningBidAmount: null,
      losingCompanyIds: [],
      bidAmountsByCompany: new Map<string, Decimal>(),
      releasableLosingCompanyIds: [],
      releasableBidAmountsByCompany: new Map<string, Decimal>(),
    };
  }

  const [winningBid, ...remainingBids] = bidRows;
  const seenCompanyIds = new Set<string>([winningBid.company_id]);
  const bidAmountsByCompany = new Map<string, Decimal>();

  for (const bid of remainingBids) {
    if (seenCompanyIds.has(bid.company_id)) {
      continue;
    }

    seenCompanyIds.add(bid.company_id);
    bidAmountsByCompany.set(bid.company_id, bid.amount);
  }

  return {
    auctionId,
    winningBidId: winningBid.id,
    winnerCompanyId: winningBid.company_id,
    winningBidAmount: winningBid.amount,
    losingCompanyIds: [...bidAmountsByCompany.keys()],
    bidAmountsByCompany,
    // Phase 3 already releases a prior leader inside the bid transaction.
    // By close time, non-winners should no longer hold active exposure.
    releasableLosingCompanyIds: [],
    releasableBidAmountsByCompany: new Map<string, Decimal>(),
  };
}

export async function releaseBuyingPowerForClosedAuction(
  tx: TxClient,
  outcome: AuctionCloseBuyingPowerOutcome,
): Promise<void> {
  await releaseAuctionBidsFromBuyingPower(
    tx,
    outcome.auctionId,
    outcome.releasableLosingCompanyIds,
    outcome.releasableBidAmountsByCompany,
  );

  await enqueueAuctionOutboxEvent(tx, {
    auctionId: outcome.auctionId,
    eventType: "AUCTION_CLOSED",
    payload: {
      winnerCompanyId: outcome.winnerCompanyId,
      winningBidId: outcome.winningBidId,
      winningBidAmount: outcome.winningBidAmount?.toFixed(2) ?? null,
      losingCompanyIds: outcome.losingCompanyIds,
    },
  });

  if (outcome.winnerCompanyId !== null && outcome.winningBidAmount !== null) {
    await enqueueAuctionOutboxEvent(tx, {
      auctionId: outcome.auctionId,
      eventType: "WINNER_DETERMINED",
      payload: {
        winnerCompanyId: outcome.winnerCompanyId,
        winningBidId: outcome.winningBidId,
        winningBidAmount: outcome.winningBidAmount.toFixed(2),
      },
    });
  }

  if (outcome.losingCompanyIds.length > 0) {
    await enqueueAuctionOutboxEvent(tx, {
      auctionId: outcome.auctionId,
      eventType: "LOSING_BIDS_RELEASED",
      payload: {
        releases: outcome.losingCompanyIds.map((companyId) => ({
          companyId,
          bidAmount: outcome.bidAmountsByCompany.get(companyId)?.toFixed(2) ?? null,
        })),
      },
    });
  }
}
