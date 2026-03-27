import { disconnectPrisma, prisma } from "../db";

type ResetSummary = {
  bidRequestsDeleted: number;
  bidsDeleted: number;
  depositLocksDeleted: number;
  paymentDeadlinesDeleted: number;
  paymentsDeleted: number;
  invoicesDeleted: number;
  auctionStateTransitionsDeleted: number;
  auctionEventLotsDeleted: number;
  auctionEventRuntimesDeleted: number;
  auctionEventsDeleted: number;
  auctionsReset: number;
};

async function resetAuctionData(): Promise<ResetSummary> {
  return prisma.$transaction(
    async (tx) => {
      const bidRequestsDeleted = await tx.bidRequest.count();
      await tx.$executeRawUnsafe('TRUNCATE TABLE "bid_requests" RESTART IDENTITY CASCADE');

      const bidsDeleted = await tx.bid.count();
      await tx.$executeRawUnsafe('TRUNCATE TABLE "bids" RESTART IDENTITY CASCADE');

      const depositLocksDeleted = await tx.depositLock.deleteMany();
      const paymentDeadlinesDeleted = await tx.paymentDeadline.deleteMany();
      const paymentsDeleted = await tx.payment.deleteMany();
      const invoicesDeleted = await tx.invoice.deleteMany();
      const auctionStateTransitionsDeleted = await tx.auctionStateTransition.count();
      await tx.$executeRawUnsafe('TRUNCATE TABLE "auction_state_transitions" RESTART IDENTITY CASCADE');
      const auctionEventLotsDeleted = await tx.auctionEventLot.deleteMany();
      const auctionEventRuntimesDeleted = await tx.auctionEventRuntime.deleteMany();
      const auctionEventsDeleted = await tx.auctionEvent.deleteMany();

      const auctionsReset = await tx.$executeRaw`
        UPDATE auctions
        SET state = 'DRAFT'::"AuctionState",
            starts_at = NOW(),
            ends_at = NOW() + INTERVAL '2 hours',
            auction_starts_at = NULL,
            auction_ends_at = NULL,
            current_price = starting_price,
            highest_bid_id = NULL,
            winner_company_id = NULL,
            closed_at = NULL,
            extension_count = 0,
            last_bid_sequence = 0,
            updated_at = NOW()
      `;

      return {
        bidRequestsDeleted,
        bidsDeleted,
        depositLocksDeleted: depositLocksDeleted.count,
        paymentDeadlinesDeleted: paymentDeadlinesDeleted.count,
        paymentsDeleted: paymentsDeleted.count,
        invoicesDeleted: invoicesDeleted.count,
        auctionStateTransitionsDeleted,
        auctionEventLotsDeleted: auctionEventLotsDeleted.count,
        auctionEventRuntimesDeleted: auctionEventRuntimesDeleted.count,
        auctionEventsDeleted: auctionEventsDeleted.count,
        auctionsReset: Number(auctionsReset),
      };
    },
    {
      timeout: 60_000,
    },
  );
}

async function main(): Promise<void> {
  const summary = await resetAuctionData();

  console.log("Auction reset complete");
  console.table(summary);
}

void main()
  .catch((error: unknown) => {
    console.error("Auction reset failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
