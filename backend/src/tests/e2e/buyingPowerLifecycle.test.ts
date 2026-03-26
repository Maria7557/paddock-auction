import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import supertest from "supertest";
import { describe, expect, it } from "vitest";

import {
  createIntegrationTestDatabase,
  loadBackendRuntime,
  signAccessToken,
  type IntegrationTestDatabase,
} from "../integration/helpers/integration_runtime";

const ZERO_DECIMAL = new Prisma.Decimal(0);
const FIVE_THOUSAND = new Prisma.Decimal(5_000);
const THREE_HUNDRED_THOUSAND = new Prisma.Decimal(300_000);

type E2EScenarioContext = {
  database: IntegrationTestDatabase;
  prisma: PrismaClient;
  request: ReturnType<typeof supertest>;
  closeExpiredAuctions: () => Promise<void>;
  enforcePaymentDeadlines: () => Promise<void>;
  createAdminToken: () => Promise<string>;
  cleanup: () => Promise<void>;
};

type BuyerAccount = {
  userId: string;
  companyId: string;
  token: string;
};

type SellerAccount = {
  userId: string;
  companyId: string;
  token: string;
};

type AuctionSeed = {
  auctionId: string;
  sellerCompanyId: string;
};

type BuyingPowerPayload = {
  depositAmount: string;
  ceiling: string;
  activeBidsTotal: string;
  remaining: string;
  activeBids: Array<{
    auctionId: string;
    lotTitle: string;
    amount: string;
  }>;
};

function money(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

async function withLifecycleScenario(
  name: string,
  run: (context: E2EScenarioContext) => Promise<void>,
): Promise<void> {
  const database = await createIntegrationTestDatabase(`buying_power_lifecycle_${name}`);
  const runtime = await loadBackendRuntime(database.schemaUrl);
  const server = await runtime.buildServer();

  if ("level" in server.log) {
    server.log.level = "silent";
  }

  await server.ready();

  const context: E2EScenarioContext = {
    database,
    prisma: database.prisma,
    request: supertest(server.server),
    closeExpiredAuctions: runtime.closeExpiredAuctions,
    enforcePaymentDeadlines: runtime.enforcePaymentDeadlines,
    createAdminToken: async () =>
      signAccessToken({
        userId: randomUUID(),
        role: "ADMIN",
      }),
    cleanup: async () => {
      await server.close();
      await runtime.disconnect();
      await database.cleanup();
    },
  };

  try {
    await run(context);
  } finally {
    await context.cleanup();
  }
}

async function createBuyerAccount(
  prisma: PrismaClient,
  label: string,
  depositAmount: Prisma.Decimal = FIVE_THOUSAND,
): Promise<BuyerAccount> {
  const companyId = randomUUID();
  const userId = randomUUID();

  await prisma.company.create({
    data: {
      id: companyId,
      name: `${label} Buyer Co`,
      country: "AE",
      registrationNumber: `BUY-${label}-${randomUUID().slice(0, 8)}`,
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
          balance: depositAmount,
          lockedBalance: ZERO_DECIMAL,
        },
      },
    },
  });

  await prisma.depositWallet.create({
    data: {
      companyId,
      currency: "AED",
      availableBalance: depositAmount,
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
    token: await signAccessToken({
      userId,
      role: "BUYER",
      companyId,
      kycVerified: true,
    }),
  };
}

async function createSellerAccount(
  prisma: PrismaClient,
  label: string,
): Promise<SellerAccount> {
  const companyId = randomUUID();
  const userId = randomUUID();

  await prisma.company.create({
    data: {
      id: companyId,
      name: `${label} Seller Co`,
      country: "AE",
      registrationNumber: `SEL-${label}-${randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      id: userId,
      email: `${label}.seller.${randomUUID()}@example.com`,
      role: "SELLER",
      status: "ACTIVE",
      companyUsers: {
        create: {
          companyId,
          role: "OWNER",
        },
      },
    },
  });

  return {
    userId,
    companyId,
    token: await signAccessToken({
      userId,
      role: "SELLER",
      companyId,
    }),
  };
}

async function createAuction(
  prisma: PrismaClient,
  input: {
    sellerCompanyId: string;
    brand: string;
    model: string;
    endsAt?: Date;
    currentPrice?: Prisma.Decimal;
    startingPrice?: Prisma.Decimal;
    minIncrement?: Prisma.Decimal;
  },
): Promise<AuctionSeed> {
  const vehicleId = randomUUID();
  const auctionId = randomUUID();

  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      brand: input.brand,
      model: input.model,
      year: 2024,
      mileage: 5_000,
      vin: `VIN-${randomUUID().replace(/-/g, "").slice(0, 17)}`,
      images: [],
    },
  });

  await prisma.auction.create({
    data: {
      id: auctionId,
      vehicleId,
      sellerCompanyId: input.sellerCompanyId,
      state: "LIVE",
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: input.endsAt ?? new Date(Date.now() + 60 * 60 * 1000),
      currentPrice: input.currentPrice ?? ZERO_DECIMAL,
      startingPrice: input.startingPrice ?? ZERO_DECIMAL,
      minIncrement: input.minIncrement ?? money(500),
    },
  });

  return {
    auctionId,
    sellerCompanyId: input.sellerCompanyId,
  };
}

async function placeBid(
  request: ReturnType<typeof supertest>,
  buyerToken: string,
  input: {
    auctionId: string;
    amount: number;
  },
) {
  return request
    .post("/api/bids")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      auctionId: input.auctionId,
      amount: input.amount,
      idempotencyKey: randomUUID(),
    });
}

async function readBuyingPower(
  request: ReturnType<typeof supertest>,
  buyerToken: string,
) {
  return request
    .get("/api/buyer/buying-power")
    .set("Authorization", `Bearer ${buyerToken}`);
}

async function acceptAuction(
  request: ReturnType<typeof supertest>,
  sellerToken: string,
  auctionId: string,
) {
  return request
    .post(`/api/seller/auctions/${auctionId}/decision`)
    .set("Authorization", `Bearer ${sellerToken}`)
    .set("idempotency-key", randomUUID())
    .send({
      decision: "accept",
    });
}

async function confirmPayment(
  request: ReturnType<typeof supertest>,
  adminToken: string,
  invoiceId: string,
) {
  return request
    .post(`/api/admin/invoices/${invoiceId}/confirm-payment`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({});
}

async function burnDeposit(
  request: ReturnType<typeof supertest>,
  adminToken: string,
  userId: string,
  auctionId: string,
) {
  return request
    .post(`/api/admin/deposits/${userId}/burn`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      auctionId,
      reason: "Payment deadline missed in E2E lifecycle test",
    });
}

async function expireAuction(prisma: PrismaClient, auctionId: string): Promise<void> {
  await prisma.auction.update({
    where: {
      id: auctionId,
    },
    data: {
      endsAt: new Date(Date.now() - 5 * 60 * 1000),
    },
  });
}

async function expirePaymentDeadline(prisma: PrismaClient, auctionId: string): Promise<void> {
  await prisma.paymentDeadline.updateMany({
    where: {
      auctionId,
      status: "ACTIVE",
    },
    data: {
      dueAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });
}

async function readSummaryAmount(prisma: PrismaClient, companyId: string): Promise<string> {
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

async function readDepositWalletBalance(prisma: PrismaClient, companyId: string): Promise<string> {
  const wallet = await prisma.depositWallet.findUnique({
    where: {
      companyId_currency: {
        companyId,
        currency: "AED",
      },
    },
    select: {
      availableBalance: true,
    },
  });

  return wallet?.availableBalance.toFixed(2) ?? "0.00";
}

async function readDepositLockStatuses(
  prisma: PrismaClient,
  companyId: string,
): Promise<string[]> {
  const locks = await prisma.depositLock.findMany({
    where: {
      companyId,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      status: true,
    },
  });

  return locks.map((lock) => lock.status);
}

async function readInvoiceId(prisma: PrismaClient, auctionId: string): Promise<string> {
  const invoice = await prisma.invoice.findUnique({
    where: {
      auctionId,
    },
    select: {
      id: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice not found for auction ${auctionId}`);
  }

  return invoice.id;
}

describe("buying power lifecycle e2e", () => {
  it(
    "Scenario A: handles multi-auction participation, ceiling rejection, outbid release, and rebid",
    async () => {
      await withLifecycleScenario("scenario_a", async ({ prisma, request }) => {
        const primaryBuyer = await createBuyerAccount(prisma, "scenario-a-primary");
        const challengerBuyer = await createBuyerAccount(prisma, "scenario-a-challenger");
        const seller = await createSellerAccount(prisma, "scenario-a-seller");
        const auctionA = await createAuction(prisma, {
          sellerCompanyId: seller.companyId,
          brand: "Auction",
          model: "A",
        });
        const auctionB = await createAuction(prisma, {
          sellerCompanyId: seller.companyId,
          brand: "Auction",
          model: "B",
        });
        const auctionC = await createAuction(prisma, {
          sellerCompanyId: seller.companyId,
          brand: "Auction",
          model: "C",
        });
        const auctionD = await createAuction(prisma, {
          sellerCompanyId: seller.companyId,
          brand: "Auction",
          model: "D",
        });

        const bidA = await placeBid(request, primaryBuyer.token, {
          auctionId: auctionA.auctionId,
          amount: 100_000,
        });

        expect(bidA.status).toBe(201);
        expect(bidA.body.buyingPower).toEqual({
          activeBidsTotal: "100000.00",
          ceiling: "300000.00",
          remaining: "200000.00",
        });

        const bidB = await placeBid(request, primaryBuyer.token, {
          auctionId: auctionB.auctionId,
          amount: 100_000,
        });

        expect(bidB.status).toBe(201);
        expect(bidB.body.buyingPower).toEqual({
          activeBidsTotal: "200000.00",
          ceiling: "300000.00",
          remaining: "100000.00",
        });

        const bidC = await placeBid(request, primaryBuyer.token, {
          auctionId: auctionC.auctionId,
          amount: 100_000,
        });

        expect(bidC.status).toBe(201);
        expect(bidC.body.buyingPower).toEqual({
          activeBidsTotal: "300000.00",
          ceiling: "300000.00",
          remaining: "0.00",
        });

        const buyingPowerAtCeiling = await readBuyingPower(request, primaryBuyer.token);

        expect(buyingPowerAtCeiling.status).toBe(200);
        expect(buyingPowerAtCeiling.body).toMatchObject({
          depositAmount: "5000.00",
          ceiling: "300000.00",
          activeBidsTotal: "300000.00",
          remaining: "0.00",
        } satisfies Partial<BuyingPowerPayload>);
        expect(buyingPowerAtCeiling.body.activeBids).toHaveLength(3);

        const rejectedBid = await placeBid(request, primaryBuyer.token, {
          auctionId: auctionD.auctionId,
          amount: 1_000,
        });

        expect(rejectedBid.status).toBe(422);
        expect(rejectedBid.body).toMatchObject({
          error: "BID_CEILING_EXCEEDED",
        });
        expect(await readSummaryAmount(prisma, primaryBuyer.companyId)).toBe("300000.00");

        const challengerBid = await placeBid(request, challengerBuyer.token, {
          auctionId: auctionB.auctionId,
          amount: 110_000,
        });

        expect(challengerBid.status).toBe(201);

        const buyingPowerAfterOutbid = await readBuyingPower(request, primaryBuyer.token);

        expect(buyingPowerAfterOutbid.status).toBe(200);
        expect(buyingPowerAfterOutbid.body).toMatchObject({
          activeBidsTotal: "200000.00",
          remaining: "100000.00",
        } satisfies Partial<BuyingPowerPayload>);
        expect(
          buyingPowerAfterOutbid.body.activeBids.map((activeBid: { auctionId: string }) => activeBid.auctionId),
        ).toEqual(expect.arrayContaining([auctionA.auctionId, auctionC.auctionId]));
        expect(
          buyingPowerAfterOutbid.body.activeBids.map((activeBid: { auctionId: string }) => activeBid.auctionId),
        ).not.toContain(auctionB.auctionId);

        const bidD = await placeBid(request, primaryBuyer.token, {
          auctionId: auctionD.auctionId,
          amount: 50_000,
        });

        expect(bidD.status).toBe(201);
        expect(bidD.body.buyingPower).toEqual({
          activeBidsTotal: "250000.00",
          ceiling: "300000.00",
          remaining: "50000.00",
        });
        expect(await readSummaryAmount(prisma, primaryBuyer.companyId)).toBe("250000.00");
      });
    },
    60_000,
  );

  it(
    "Scenario B: closes a winning auction, confirms payment, releases the lock, and allows bidding again",
    async () => {
      await withLifecycleScenario(
        "scenario_b",
        async ({ prisma, request, closeExpiredAuctions, createAdminToken }) => {
          const winningBuyer = await createBuyerAccount(prisma, "scenario-b-winner");
          const losingBuyer = await createBuyerAccount(prisma, "scenario-b-loser");
          const seller = await createSellerAccount(prisma, "scenario-b-seller");
          const auction = await createAuction(prisma, {
            sellerCompanyId: seller.companyId,
            brand: "Winning",
            model: "Auction",
          });
          const followUpAuction = await createAuction(prisma, {
            sellerCompanyId: seller.companyId,
            brand: "Follow Up",
            model: "Auction",
          });

          const losingBid = await placeBid(request, losingBuyer.token, {
            auctionId: auction.auctionId,
            amount: 180_000,
          });
          const winningBid = await placeBid(request, winningBuyer.token, {
            auctionId: auction.auctionId,
            amount: 200_000,
          });

          expect(losingBid.status).toBe(201);
          expect(winningBid.status).toBe(201);
          expect(winningBid.body.buyingPower).toEqual({
            activeBidsTotal: "200000.00",
            ceiling: "300000.00",
            remaining: "100000.00",
          });

          await expireAuction(prisma, auction.auctionId);
          await closeExpiredAuctions();

          const closedAuction = await prisma.auction.findUnique({
            where: {
              id: auction.auctionId,
            },
            select: {
              state: true,
              winnerCompanyId: true,
            },
          });

          expect(closedAuction).toMatchObject({
            state: "AWAITING_SELLER_DECISION",
            winnerCompanyId: winningBuyer.companyId,
          });
          expect(await readSummaryAmount(prisma, losingBuyer.companyId)).toBe("0.00");
          expect(await readSummaryAmount(prisma, winningBuyer.companyId)).toBe("200000.00");

          const acceptResponse = await acceptAuction(request, seller.token, auction.auctionId);

          expect(acceptResponse.status).toBe(200);
          expect(acceptResponse.body.newStatus).toBe("PAYMENT_PENDING");

          const adminToken = await createAdminToken();
          const invoiceId = await readInvoiceId(prisma, auction.auctionId);
          const paymentResponse = await confirmPayment(request, adminToken, invoiceId);

          expect(paymentResponse.status).toBe(200);
          expect(paymentResponse.body.status).toBe("PAID");

          const [summaryAfterPayment, depositWalletBalance, depositLockStatuses, postPaymentPower] =
            await Promise.all([
              readSummaryAmount(prisma, winningBuyer.companyId),
              readDepositWalletBalance(prisma, winningBuyer.companyId),
              readDepositLockStatuses(prisma, winningBuyer.companyId),
              readBuyingPower(request, winningBuyer.token),
            ]);

          expect(summaryAfterPayment).toBe("0.00");
          expect(depositWalletBalance).toBe("5000.00");
          expect(depositLockStatuses).toContain("RELEASED");
          expect(postPaymentPower.status).toBe(200);
          expect(postPaymentPower.body).toEqual({
            depositAmount: "0.00",
            ceiling: "0.00",
            activeBidsTotal: "0.00",
            remaining: "0.00",
            activeBids: [],
          });

          const restoredBid = await placeBid(request, winningBuyer.token, {
            auctionId: followUpAuction.auctionId,
            amount: 100_000,
          });

          expect(restoredBid.status).toBe(201);
          expect(restoredBid.body.buyingPower).toEqual({
            activeBidsTotal: "100000.00",
            ceiling: "300000.00",
            remaining: "200000.00",
          });
        },
      );
    },
    60_000,
  );

  it(
    "Scenario C: defaults a winning buyer, burns the deposit, and blocks new bids",
    async () => {
      await withLifecycleScenario(
        "scenario_c",
        async ({ prisma, request, closeExpiredAuctions, enforcePaymentDeadlines, createAdminToken }) => {
          const defaultingBuyer = await createBuyerAccount(prisma, "scenario-c-winner");
          const losingBuyer = await createBuyerAccount(prisma, "scenario-c-loser");
          const seller = await createSellerAccount(prisma, "scenario-c-seller");
          const auction = await createAuction(prisma, {
            sellerCompanyId: seller.companyId,
            brand: "Default",
            model: "Auction",
          });
          const followUpAuction = await createAuction(prisma, {
            sellerCompanyId: seller.companyId,
            brand: "Blocked",
            model: "Auction",
          });

          const losingBid = await placeBid(request, losingBuyer.token, {
            auctionId: auction.auctionId,
            amount: 140_000,
          });
          const winningBid = await placeBid(request, defaultingBuyer.token, {
            auctionId: auction.auctionId,
            amount: 150_000,
          });

          expect(losingBid.status).toBe(201);
          expect(winningBid.status).toBe(201);

          await expireAuction(prisma, auction.auctionId);
          await closeExpiredAuctions();

          const acceptResponse = await acceptAuction(request, seller.token, auction.auctionId);

          expect(acceptResponse.status).toBe(200);
          expect(acceptResponse.body.newStatus).toBe("PAYMENT_PENDING");

          await expirePaymentDeadline(prisma, auction.auctionId);
          await enforcePaymentDeadlines();

          const [invoiceAfterDefault, auctionAfterDefault] = await Promise.all([
            prisma.invoice.findUnique({
              where: {
                auctionId: auction.auctionId,
              },
              select: {
                status: true,
              },
            }),
            prisma.auction.findUnique({
              where: {
                id: auction.auctionId,
              },
              select: {
                state: true,
              },
            }),
          ]);

          expect(invoiceAfterDefault?.status).toBe("DEFAULTED");
          expect(auctionAfterDefault?.state).toBe("DEFAULTED");

          const adminToken = await createAdminToken();
          const burnResponse = await burnDeposit(
            request,
            adminToken,
            defaultingBuyer.userId,
            auction.auctionId,
          );

          expect(burnResponse.status).toBe(200);

          const [summaryAfterBurn, walletAfterBurn, depositLockStatuses, buyingPowerAfterBurn] =
            await Promise.all([
              readSummaryAmount(prisma, defaultingBuyer.companyId),
              readDepositWalletBalance(prisma, defaultingBuyer.companyId),
              readDepositLockStatuses(prisma, defaultingBuyer.companyId),
              readBuyingPower(request, defaultingBuyer.token),
            ]);

          expect(summaryAfterBurn).toBe("0.00");
          expect(walletAfterBurn).toBe("0.00");
          expect(depositLockStatuses).toContain("BURNED");
          expect(buyingPowerAfterBurn.status).toBe(200);
          expect(buyingPowerAfterBurn.body).toEqual({
            depositAmount: "0.00",
            ceiling: "0.00",
            activeBidsTotal: "0.00",
            remaining: "0.00",
            activeBids: [],
          });

          const blockedBid = await placeBid(request, defaultingBuyer.token, {
            auctionId: followUpAuction.auctionId,
            amount: 100_000,
          });

          expect(blockedBid.status).toBe(422);
          expect(blockedBid.body).toMatchObject({
            error: "BID_INSUFFICIENT_DEPOSIT",
          });
          expect(await readSummaryAmount(prisma, defaultingBuyer.companyId)).toBe("0.00");
        },
      );
    },
    60_000,
  );
});
