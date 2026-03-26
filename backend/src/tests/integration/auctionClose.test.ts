import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { executePlaceBidCommand } from "../../modules/bidding/application/place_bid";
import {
  createIntegrationTestDatabase,
  createServerForSchema,
  loadBackendRuntime,
  signAccessToken,
} from "./helpers/integration_runtime";

const ZERO_DECIMAL = new Prisma.Decimal(0);
const FIVE_THOUSAND = new Prisma.Decimal(5_000);
const THREE_HUNDRED_THOUSAND = new Prisma.Decimal(300_000);

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;
type TestServer = Awaited<ReturnType<typeof createServerForSchema>>;

type BuyerFixture = {
  userId: string;
  companyId: string;
};

type AuctionFixture = {
  auctionId: string;
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
      wallet: {
        create: {
          balance: 5_000,
          lockedBalance: 0,
        },
      },
    },
  });

  await prisma.depositWallet.create({
    data: {
      companyId,
      currency: "AED",
      availableBalance: FIVE_THOUSAND,
      lockedBalance: ZERO_DECIMAL,
      pendingWithdrawalBalance: ZERO_DECIMAL,
    },
  });

  await prisma.buyerBidSummary.create({
    data: {
      companyId,
      activeBidsTotal: ZERO_DECIMAL,
    },
  });

  return {
    userId,
    companyId,
  };
}

async function createAuction(
  prisma: PrismaClient,
  input: {
    state?: "LIVE" | "AWAITING_SELLER_DECISION" | "PAYMENT_PENDING";
    currentPrice?: Prisma.Decimal;
    minIncrement?: Prisma.Decimal;
    endsAt?: Date;
    winnerCompanyId?: string | null;
  } = {},
): Promise<AuctionFixture> {
  const vehicleId = randomUUID();
  const auctionId = randomUUID();
  const sellerCompanyId = randomUUID();

  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      brand: "Nissan",
      model: "Patrol",
      year: 2021,
      mileage: 20_000,
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
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endsAt: input.endsAt ?? new Date(Date.now() - 5 * 60 * 1000),
      currentPrice: input.currentPrice ?? money(90_000),
      startingPrice: money(90_000),
      minIncrement: input.minIncrement ?? money(1_000),
      winnerCompanyId: input.winnerCompanyId ?? null,
    },
  });

  return {
    auctionId,
    sellerCompanyId,
  };
}

async function placeBid(
  prisma: PrismaClient,
  buyer: BuyerFixture,
  auctionId: string,
  amount: number,
): Promise<void> {
  const result = await executePlaceBidCommand(prisma, {
    auctionId,
    companyId: buyer.companyId,
    userId: buyer.userId,
    amount,
    idempotencyKey: randomUUID(),
  });

  if (result.kind !== "success") {
    throw new Error(`placeBid failed: ${JSON.stringify(result)}`);
  }
}

async function createInvoiceForAuction(
  prisma: PrismaClient,
  auction: AuctionFixture,
  winnerCompanyId: string,
  total: Prisma.Decimal,
): Promise<string> {
  const invoice = await prisma.invoice.create({
    data: {
      auctionId: auction.auctionId,
      buyerCompanyId: winnerCompanyId,
      sellerCompanyId: auction.sellerCompanyId,
      subtotal: total,
      commission: ZERO_DECIMAL,
      vat: ZERO_DECIMAL,
      total,
      currency: "AED",
      status: "ISSUED",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return invoice.id;
}

async function createPaymentPendingAuctionState(
  prisma: PrismaClient,
  auctionId: string,
  winnerCompanyId: string,
  currentPrice: Prisma.Decimal,
): Promise<void> {
  await prisma.auction.update({
    where: {
      id: auctionId,
    },
    data: {
      state: "PAYMENT_PENDING",
      winnerCompanyId,
      currentPrice,
    },
  });
}

async function ensureWinningExposure(
  prisma: PrismaClient,
  winnerCompanyId: string,
  amount: Prisma.Decimal,
): Promise<void> {
  await prisma.buyerBidSummary.update({
    where: {
      companyId: winnerCompanyId,
    },
    data: {
      activeBidsTotal: amount,
    },
  });

  await prisma.depositLock.create({
    data: {
      companyId: winnerCompanyId,
      amount: FIVE_THOUSAND,
      buyingPowerCeiling: THREE_HUNDRED_THOUSAND,
      status: "ACTIVE",
    },
  });
}

async function readSummary(prisma: PrismaClient, companyId: string): Promise<string> {
  const summary = await prisma.buyerBidSummary.findUnique({
    where: {
      companyId,
    },
  });

  return summary?.activeBidsTotal.toFixed(2) ?? "0.00";
}

describe("auction close and payment/default buying power release", () => {
  let database: IntegrationDatabase;
  let appPrisma: PrismaClient;
  let server: TestServer | null = null;

  beforeAll(async () => {
    database = await createIntegrationTestDatabase("auction_close");
    appPrisma = database.createClient();
    await appPrisma.$connect();
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }

    if (appPrisma) {
      await appPrisma.$disconnect();
    }

    if (database) {
      await database.cleanup();
    }
  }, 60_000);

  beforeEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }

    await database.reset();
  }, 30_000);

  it("keeps losing bidders released and leaves the winner unchanged when the auction closes", async () => {
    const firstBuyer = await createBuyer(database.prisma, "close-loser");
    const secondBuyer = await createBuyer(database.prisma, "close-winner");
    const auction = await createAuction(database.prisma, {
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await placeBid(appPrisma, firstBuyer, auction.auctionId, 100_000);
    await placeBid(appPrisma, secondBuyer, auction.auctionId, 120_000);
    await database.prisma.auction.update({
      where: {
        id: auction.auctionId,
      },
      data: {
        endsAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });

    const runtime = await loadBackendRuntime(database.schemaUrl);

    try {
      await runtime.closeExpiredAuctions();
    } finally {
      await runtime.disconnect();
    }

    const [loserSummary, winnerSummary, closedAuction, closeEvents] = await Promise.all([
      readSummary(database.prisma, firstBuyer.companyId),
      readSummary(database.prisma, secondBuyer.companyId),
      database.prisma.auction.findUnique({
        where: {
          id: auction.auctionId,
        },
        select: {
          state: true,
          winnerCompanyId: true,
        },
      }),
      database.prisma.outboxEvent.findMany({
        where: {
          aggregateId: auction.auctionId,
          eventType: {
            in: ["AUCTION_CLOSED", "LOSING_BIDS_RELEASED"],
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
    ]);

    expect(loserSummary).toBe("0.00");
    expect(winnerSummary).toBe("120000.00");
    expect(closedAuction).toMatchObject({
      state: "AWAITING_SELLER_DECISION",
      winnerCompanyId: secondBuyer.companyId,
    });
    expect(closeEvents.map((event) => event.eventType)).toEqual([
      "AUCTION_CLOSED",
      "LOSING_BIDS_RELEASED",
    ]);
  });

  it("releases the winner buying power and lock after payment confirmation", async () => {
    const winner = await createBuyer(database.prisma, "paid-winner");
    const auction = await createAuction(database.prisma, {
      state: "AWAITING_SELLER_DECISION",
      currentPrice: money(150_000),
      winnerCompanyId: winner.companyId,
    });

    await ensureWinningExposure(database.prisma, winner.companyId, money(150_000));
    await createPaymentPendingAuctionState(
      database.prisma,
      auction.auctionId,
      winner.companyId,
      money(150_000),
    );
    const invoiceId = await createInvoiceForAuction(
      database.prisma,
      auction,
      winner.companyId,
      money(150_000),
    );

    const adminToken = await signAccessToken({
      userId: randomUUID(),
      role: "ADMIN",
    });

    server = await createServerForSchema(database.schemaUrl);

    const response = await server.request
      .post(`/api/admin/invoices/${invoiceId}/confirm-payment`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("PAID");

    const [summary, activeLocks, invoice, auctionRow] = await Promise.all([
      readSummary(database.prisma, winner.companyId),
      database.prisma.depositLock.findMany({
        where: {
          companyId: winner.companyId,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      database.prisma.invoice.findUnique({
        where: {
          id: invoiceId,
        },
      }),
      database.prisma.auction.findUnique({
        where: {
          id: auction.auctionId,
        },
      }),
    ]);

    expect(summary).toBe("0.00");
    expect(activeLocks).toHaveLength(1);
    expect(activeLocks[0]?.status).toBe("RELEASED");
    expect(invoice?.status).toBe("PAID");
    expect(auctionRow?.state).toBe("PAID");
  });

  it("decrements the winner summary before burning the defaulted deposit", async () => {
    const winner = await createBuyer(database.prisma, "default-winner");
    const auction = await createAuction(database.prisma, {
      state: "PAYMENT_PENDING",
      currentPrice: money(140_000),
      winnerCompanyId: winner.companyId,
    });

    await ensureWinningExposure(database.prisma, winner.companyId, money(140_000));
    await createInvoiceForAuction(database.prisma, auction, winner.companyId, money(140_000));
    await database.prisma.paymentDeadline.create({
      data: {
        auctionId: auction.auctionId,
        buyerCompanyId: winner.companyId,
        dueAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    await database.prisma.bid.create({
      data: {
        auctionId: auction.auctionId,
        companyId: winner.companyId,
        userId: winner.userId,
        amount: money(140_000),
        sequenceNo: 1,
      },
    });

    const runtime = await loadBackendRuntime(database.schemaUrl);

    try {
      await runtime.enforcePaymentDeadlines();
    } finally {
      await runtime.disconnect();
    }

    const adminToken = await signAccessToken({
      userId: randomUUID(),
      role: "ADMIN",
    });

    server = await createServerForSchema(database.schemaUrl);

    const burnResponse = await server.request
      .post(`/api/admin/deposits/${winner.userId}/burn`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        auctionId: auction.auctionId,
        reason: "Payment deadline missed by integration test",
      });

    expect(burnResponse.status).toBe(200);

    const [summary, depositWallet, depositLocks, auctionRow, defaultEvents] = await Promise.all([
      readSummary(database.prisma, winner.companyId),
      database.prisma.depositWallet.findUnique({
        where: {
          companyId_currency: {
            companyId: winner.companyId,
            currency: "AED",
          },
        },
      }),
      database.prisma.depositLock.findMany({
        where: {
          companyId: winner.companyId,
        },
      }),
      database.prisma.auction.findUnique({
        where: {
          id: auction.auctionId,
        },
      }),
      database.prisma.outboxEvent.findMany({
        where: {
          aggregateId: auction.auctionId,
          eventType: "PAYMENT_DEFAULTED",
        },
      }),
    ]);

    expect(summary).toBe("0.00");
    expect(depositWallet?.availableBalance.toFixed(2)).toBe("0.00");
    expect(depositLocks).toHaveLength(1);
    expect(depositLocks[0]?.status).toBe("BURNED");
    expect(auctionRow?.state).toBe("DEFAULTED");
    expect(defaultEvents).toHaveLength(1);
  });

  it("lets the losing buyer bid immediately on a new auction once buying power is restored", async () => {
    const firstBuyer = await createBuyer(database.prisma, "restored-loser");
    const secondBuyer = await createBuyer(database.prisma, "restored-winner");
    const firstAuction = await createAuction(database.prisma, {
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const secondAuction = await createAuction(database.prisma, {
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await placeBid(appPrisma, firstBuyer, firstAuction.auctionId, 200_000);
    await placeBid(appPrisma, secondBuyer, firstAuction.auctionId, 210_000);
    await database.prisma.auction.update({
      where: {
        id: firstAuction.auctionId,
      },
      data: {
        endsAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });

    const runtime = await loadBackendRuntime(database.schemaUrl);

    try {
      await runtime.closeExpiredAuctions();
    } finally {
      await runtime.disconnect();
    }

    const followUpBid = await executePlaceBidCommand(appPrisma, {
      auctionId: secondAuction.auctionId,
      companyId: firstBuyer.companyId,
      userId: firstBuyer.userId,
      amount: 100_000,
      idempotencyKey: randomUUID(),
    });

    expect(followUpBid.kind).toBe("success");
    expect(await readSummary(database.prisma, firstBuyer.companyId)).toBe("100000.00");
  });
});
