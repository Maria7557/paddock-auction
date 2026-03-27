import { disconnectPrisma, prisma } from "../db";

type ResetToPendingSummary = {
  auctionEventLotsDeleted: number;
  auctionEventRuntimesDeleted: number;
  auctionEventsDeleted: number;
  auctionStateTransitionsDeleted: number;
  bidsDeleted: number;
  bidRequestsDeleted: number;
  depositLocksDeleted: number;
  paymentDeadlinesDeleted: number;
  paymentsDeleted: number;
  invoicesDeleted: number;
  auctionsDeleted: number;
  vehiclesResetToPending: number;
  vehicleStatusColumnPresent: boolean;
};

async function resetToPending(): Promise<ResetToPendingSummary> {
  return prisma.$transaction(
    async (tx) => {
      const auctionEventLotsDeleted = await tx.auctionEventLot.deleteMany();
      const auctionEventRuntimesDeleted = await tx.auctionEventRuntime.deleteMany();
      const auctionEventsDeleted = await tx.auctionEvent.deleteMany();

      const auctionStateTransitionsDeleted = await tx.auctionStateTransition.count();
      await tx.$executeRawUnsafe('TRUNCATE TABLE "auction_state_transitions" RESTART IDENTITY CASCADE');

      const bidsDeleted = await tx.bid.count();
      await tx.$executeRawUnsafe('TRUNCATE TABLE "bids" RESTART IDENTITY CASCADE');

      const bidRequestsDeleted = await tx.bidRequest.count();
      await tx.$executeRawUnsafe('TRUNCATE TABLE "bid_requests" RESTART IDENTITY CASCADE');

      const depositLocksDeleted = await tx.depositLock.deleteMany();
      const paymentDeadlinesDeleted = await tx.paymentDeadline.deleteMany();
      const paymentsDeleted = await tx.payment.deleteMany();
      const invoicesDeleted = await tx.invoice.deleteMany();
      const auctionsDeleted = await tx.auction.deleteMany();
      const vehicleStatusColumn = await tx.$queryRawUnsafe<Array<{ column_name: string }>>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Vehicle'
          AND column_name = 'status'
      `);
      const vehicleStatusColumnPresent = vehicleStatusColumn.length > 0;
      const vehiclesResetToPending = vehicleStatusColumnPresent
        ? Number(
            await tx.$executeRawUnsafe(`
              UPDATE "Vehicle"
              SET "status" = 'PENDING'
            `),
          )
        : 0;

      return {
        auctionEventLotsDeleted: auctionEventLotsDeleted.count,
        auctionEventRuntimesDeleted: auctionEventRuntimesDeleted.count,
        auctionEventsDeleted: auctionEventsDeleted.count,
        auctionStateTransitionsDeleted,
        bidsDeleted,
        bidRequestsDeleted,
        depositLocksDeleted: depositLocksDeleted.count,
        paymentDeadlinesDeleted: paymentDeadlinesDeleted.count,
        paymentsDeleted: paymentsDeleted.count,
        invoicesDeleted: invoicesDeleted.count,
        auctionsDeleted: auctionsDeleted.count,
        vehiclesResetToPending,
        vehicleStatusColumnPresent,
      };
    },
    {
      timeout: 60_000,
    },
  );
}

async function main(): Promise<void> {
  const summary = await resetToPending();

  console.log("Reset to pending complete");
  console.table(summary);

  if (!summary.vehicleStatusColumnPresent) {
    console.log('Skipped Vehicle.status reset: column "status" does not exist on table "Vehicle".');
  }
}

void main()
  .catch((error: unknown) => {
    console.error("Reset to pending failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
