import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { executePlaceBidCommand } from "../../modules/bidding/application/place_bid";
import { createIntegrationTestDatabase } from "./helpers/integration_runtime";

const ZERO_DECIMAL = new Prisma.Decimal(0);
const FIVE_THOUSAND = new Prisma.Decimal(5_000);
const THREE_HUNDRED_THOUSAND = new Prisma.Decimal(300_000);

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type BuyerFixture = {
  userId: string;
  companyId: string;
};

type AuctionFixture = {
  auctionId: string;
  vehicleId: string;
  sellerCompanyId: string;
};

function money(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

async function createBuyer(
  prisma: PrismaClient,
  label: string,
): Promise<BuyerFixture> {
  const companyId = randomUUID();
  const userId = randomUUID();

  await prisma.company.create({
    data: {
      id: companyId,
      name: `${label} Buyer Co`,
      country: "AE",
      registrationNumber: `REG-${label}-${randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      id: userId,
      email: `${label}.${randomUUID()}@example.com`,
      role: "BUYER",
      status: "ACTIVE",
      kycVerified: true,
      companyUsers: {
        create: {
          companyId,
          role: "BUYER_BIDDER",
        },
      },
    },
  });

  return {
    userId,
    companyId,
  };
}

async function createBuyerFinanceState(
  prisma: PrismaClient,
  buyer: BuyerFixture,
  input: {
    depositAmount?: Prisma.Decimal;
    activeBidsTotal?: Prisma.Decimal;
    createActiveLock?: boolean;
  } = {},
): Promise<void> {
  const depositAmount = input.depositAmount ?? FIVE_THOUSAND;
  const activeBidsTotal = input.activeBidsTotal ?? ZERO_DECIMAL;
  const createActiveLock = input.createActiveLock ?? false;

  await prisma.depositWallet.create({
    data: {
      companyId: buyer.companyId,
      currency: "AED",
      availableBalance: depositAmount,
      lockedBalance: ZERO_DECIMAL,
      pendingWithdrawalBalance: ZERO_DECIMAL,
    },
  });

  await prisma.buyerBidSummary.create({
    data: {
      companyId: buyer.companyId,
      activeBidsTotal,
    },
  });

  if (createActiveLock) {
    await prisma.depositLock.create({
      data: {
        companyId: buyer.companyId,
        amount: depositAmount,
        buyingPowerCeiling: depositAmount.dividedBy(FIVE_THOUSAND).times(THREE_HUNDRED_THOUSAND),
        status: "ACTIVE",
      },
    });
  }
}

async function createAuction(
  prisma: PrismaClient,
  input: {
    state?: "LIVE" | "ENDED";
    currentPrice?: Prisma.Decimal;
    minIncrement?: Prisma.Decimal;
    startsAt?: Date;
    endsAt?: Date;
  } = {},
): Promise<AuctionFixture> {
  const vehicleId = randomUUID();
  const auctionId = randomUUID();
  const sellerCompanyId = randomUUID();
  const now = Date.now();

  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      brand: "Toyota",
      model: "Land Cruiser",
      year: 2022,
      mileage: 12_000,
      vin: `VIN-${randomUUID().replace(/-/g, "").slice(0, 17)}`,
      images: [],
    },
  });

  await prisma.auction.create({
    data: {
      id: auctionId,
      vehicleId,
      sellerCompanyId,
      state: input.state ?? "LIVE",
      startsAt: input.startsAt ?? new Date(now - 60 * 60 * 1000),
      endsAt: input.endsAt ?? new Date(now + 60 * 60 * 1000),
      currentPrice: input.currentPrice ?? money(90_000),
      startingPrice: money(90_000),
      minIncrement: input.minIncrement ?? money(1_000),
    },
  });

  return {
    auctionId,
    vehicleId,
    sellerCompanyId,
  };
}

async function readSummaryTotal(prisma: PrismaClient, companyId: string): Promise<string> {
  const summary = await prisma.buyerBidSummary.findUnique({
    where: {
      companyId,
    },
    select: {
      activeBidsTotal: true,
    },
  });

  return summary?.activeBidsTotal.toFixed(2) ?? "0.00";
}

async function createCommandClient(database: IntegrationDatabase): Promise<PrismaClient> {
  const prisma = database.createClient();
  await prisma.$connect();
  return prisma;
}

describe("buying power bid transaction atomicity", () => {
  let database: IntegrationDatabase;

  beforeAll(async () => {
    database = await createIntegrationTestDatabase("bid_transaction");
  }, 60_000);

  afterAll(async () => {
    if (database) {
      await database.cleanup();
    }
  }, 60_000);

  beforeEach(async () => {
    await database.reset();
  }, 30_000);

  it(
    "accepts only one of 10 concurrent bids from the same buyer and never duplicates active exposure",
    async () => {
      const buyer = await createBuyer(database.prisma, "same-buyer");
      const auction = await createAuction(database.prisma);

      await createBuyerFinanceState(database.prisma, buyer);

      const appPrisma = await createCommandClient(database);

      try {
        const results = await Promise.all(
          Array.from({ length: 10 }, () =>
            executePlaceBidCommand(appPrisma, {
              auctionId: auction.auctionId,
              companyId: buyer.companyId,
              userId: buyer.userId,
              amount: 100_000,
              idempotencyKey: randomUUID(),
            }),
          ),
        );

        expect(results.filter((result) => result.kind === "success")).toHaveLength(1);
        expect(results.filter((result) => result.kind === "rejected")).toHaveLength(9);

        const [summary, bids, activeLocks] = await Promise.all([
          database.prisma.buyerBidSummary.findUnique({
            where: {
              companyId: buyer.companyId,
            },
          }),
          database.prisma.bid.findMany({
            where: {
              auctionId: auction.auctionId,
            },
          }),
          database.prisma.depositLock.findMany({
            where: {
              companyId: buyer.companyId,
              status: "ACTIVE",
            },
          }),
        ]);

        expect(summary?.activeBidsTotal.toFixed(2)).toBe("100000.00");
        expect(bids).toHaveLength(1);
        expect(activeLocks).toHaveLength(1);
      } finally {
        await appPrisma.$disconnect();
      }
    },
    30_000,
  );

  it(
    "releases the previous leader and records the new leader consistently when two buyers contend",
    async () => {
      const firstBuyer = await createBuyer(database.prisma, "first");
      const secondBuyer = await createBuyer(database.prisma, "second");
      const auction = await createAuction(database.prisma);

      await createBuyerFinanceState(database.prisma, firstBuyer);
      await createBuyerFinanceState(database.prisma, secondBuyer);

      const firstClient = await createCommandClient(database);
      const secondClient = await createCommandClient(database);

      try {
        const firstResult = await executePlaceBidCommand(firstClient, {
          auctionId: auction.auctionId,
          companyId: firstBuyer.companyId,
          userId: firstBuyer.userId,
          amount: 100_000,
          idempotencyKey: randomUUID(),
        });

        if (firstResult.kind !== "success") {
          throw new Error(`firstResult=${JSON.stringify(firstResult)}`);
        }

        const secondResult = await executePlaceBidCommand(secondClient, {
          auctionId: auction.auctionId,
          companyId: secondBuyer.companyId,
          userId: secondBuyer.userId,
          amount: 110_000,
          idempotencyKey: randomUUID(),
        });

        expect(secondResult.kind).toBe("success");

        const [firstSummary, secondSummary, auctionRow, outbidEvents] = await Promise.all([
          readSummaryTotal(database.prisma, firstBuyer.companyId),
          readSummaryTotal(database.prisma, secondBuyer.companyId),
          database.prisma.auction.findUnique({
            where: {
              id: auction.auctionId,
            },
            select: {
              currentPrice: true,
            },
          }),
          database.prisma.outboxEvent.findMany({
            where: {
              aggregateType: "BUYER_BID_SUMMARY",
              aggregateId: firstBuyer.companyId,
              eventType: "BUYER_OUTBID",
            },
          }),
        ]);

        expect(firstSummary).toBe("0.00");
        expect(secondSummary).toBe("110000.00");
        expect(auctionRow?.currentPrice.toFixed(2)).toBe("110000.00");
        expect(outbidEvents).toHaveLength(1);
      } finally {
        await firstClient.$disconnect();
        await secondClient.$disconnect();
      }
    },
    30_000,
  );

  it("does not modify active buying power when the bid fails at the ceiling gate", async () => {
    const buyer = await createBuyer(database.prisma, "ceiling");
    const auction = await createAuction(database.prisma, {
      currentPrice: money(40_000),
      minIncrement: money(500),
    });

    await createBuyerFinanceState(database.prisma, buyer, {
      activeBidsTotal: money(280_000),
      createActiveLock: true,
    });

    const appPrisma = await createCommandClient(database);

    try {
      const result = await executePlaceBidCommand(appPrisma, {
        auctionId: auction.auctionId,
        companyId: buyer.companyId,
        userId: buyer.userId,
        amount: 50_000,
        idempotencyKey: randomUUID(),
      });

      if (result.statusCode !== 422) {
        throw new Error(`gateResult=${JSON.stringify(result)}`);
      }

      expect(result.kind).toBe("rejected");
      expect(result.statusCode).toBe(422);
      expect(result.body).toMatchObject({
        error: "BID_CEILING_EXCEEDED",
      });

      const [summaryTotal, bids] = await Promise.all([
        readSummaryTotal(database.prisma, buyer.companyId),
        database.prisma.bid.findMany({
          where: {
            auctionId: auction.auctionId,
          },
        }),
      ]);

      expect(summaryTotal).toBe("280000.00");
      expect(bids).toHaveLength(0);
    } finally {
      await appPrisma.$disconnect();
    }
  });

  it("does not modify active buying power when the auction state check fails", async () => {
    const buyer = await createBuyer(database.prisma, "auction-state");
    const auction = await createAuction(database.prisma, {
      state: "ENDED",
      currentPrice: money(40_000),
    });

    await createBuyerFinanceState(database.prisma, buyer, {
      activeBidsTotal: money(125_000),
    });

    const appPrisma = await createCommandClient(database);

    try {
      const result = await executePlaceBidCommand(appPrisma, {
        auctionId: auction.auctionId,
        companyId: buyer.companyId,
        userId: buyer.userId,
        amount: 50_000,
        idempotencyKey: randomUUID(),
      });

      if (result.statusCode !== 422) {
        throw new Error(`auctionStateResult=${JSON.stringify(result)}`);
      }

      expect(result.kind).toBe("rejected");
      expect(result.statusCode).toBe(422);
      expect(result.body).toMatchObject({
        error: "BID_AUCTION_NOT_LIVE",
      });
      expect(await readSummaryTotal(database.prisma, buyer.companyId)).toBe("125000.00");
    } finally {
      await appPrisma.$disconnect();
    }
  });

  it(
    "rolls back fully when the database connection drops mid-transaction",
    async () => {
      const buyer = await createBuyer(database.prisma, "disconnect");
      const auction = await createAuction(database.prisma);

      await createBuyerFinanceState(database.prisma, buyer);

      await database.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION terminate_bid_connection() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_terminate_backend(pg_backend_pid());
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await database.prisma.$executeRawUnsafe(`
        CREATE TRIGGER bids_kill_connection_trigger
        BEFORE INSERT ON bids
        FOR EACH ROW
        EXECUTE FUNCTION terminate_bid_connection();
      `);

      const appPrisma = await createCommandClient(database);

      try {
        const result = await executePlaceBidCommand(appPrisma, {
          auctionId: auction.auctionId,
          companyId: buyer.companyId,
          userId: buyer.userId,
          amount: 100_000,
          idempotencyKey: randomUUID(),
        });

        expect(result.kind).toBe("rejected");
        expect(result.statusCode).toBe(500);
        expect(result.body).toMatchObject({
          error: "INTERNAL_ERROR",
        });
      } finally {
        await appPrisma.$disconnect().catch(() => undefined);
      }

      const [summaryTotal, bids] = await Promise.all([
        readSummaryTotal(database.prisma, buyer.companyId),
        database.prisma.bid.findMany({
          where: {
            auctionId: auction.auctionId,
          },
        }),
      ]);

      expect(summaryTotal).toBe("0.00");
      expect(bids).toHaveLength(0);
    },
    30_000,
  );

  it("rolls back the bid and summary update when outbox insertion fails", async () => {
    const buyer = await createBuyer(database.prisma, "outbox-failure");
    const auction = await createAuction(database.prisma);

    await createBuyerFinanceState(database.prisma, buyer);

    await database.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION reject_outbox_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated outbox failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await database.prisma.$executeRawUnsafe(`
      CREATE TRIGGER outbox_failure_trigger
      BEFORE INSERT ON outbox_events
      FOR EACH ROW
      EXECUTE FUNCTION reject_outbox_insert();
    `);

    const appPrisma = await createCommandClient(database);

    try {
      const result = await executePlaceBidCommand(appPrisma, {
        auctionId: auction.auctionId,
        companyId: buyer.companyId,
        userId: buyer.userId,
        amount: 100_000,
        idempotencyKey: randomUUID(),
      });

      expect(result.kind).toBe("rejected");
      expect(result.statusCode).toBe(500);
      expect(result.body).toMatchObject({
        error: "INTERNAL_ERROR",
      });
    } finally {
      await appPrisma.$disconnect();
    }

    const [summaryTotal, bids, outboxEvents] = await Promise.all([
      readSummaryTotal(database.prisma, buyer.companyId),
      database.prisma.bid.findMany({
        where: {
          auctionId: auction.auctionId,
        },
      }),
      database.prisma.outboxEvent.findMany(),
    ]);

    expect(summaryTotal).toBe("0.00");
    expect(bids).toHaveLength(0);
    expect(outboxEvents).toHaveLength(0);
  });
});
