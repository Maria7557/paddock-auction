import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationTestDatabase,
  createServerForSchema,
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

async function createAuction(
  prisma: PrismaClient,
  label: string,
): Promise<{ auctionId: string; vehicleId: string }> {
  const vehicleId = randomUUID();
  const auctionId = randomUUID();

  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      brand: label,
      model: "Model",
      year: 2023,
      mileage: 5_000,
      vin: `VIN-${randomUUID().replace(/-/g, "").slice(0, 17)}`,
      images: [],
    },
  });

  await prisma.auction.create({
    data: {
      id: auctionId,
      vehicleId,
      sellerCompanyId: randomUUID(),
      state: "LIVE",
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      currentPrice: money(80_000),
      startingPrice: money(80_000),
      minIncrement: money(1_000),
    },
  });

  return {
    auctionId,
    vehicleId,
  };
}

describe("GET /api/buyer/buying-power", () => {
  let database: IntegrationDatabase;
  let server: TestServer;

  beforeAll(async () => {
    database = await createIntegrationTestDatabase("buying_power_api");
    server = await createServerForSchema(database.schemaUrl);
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }

    if (database) {
      await database.cleanup();
    }
  }, 60_000);

  beforeEach(async () => {
    await database.reset();
  }, 30_000);

  it("returns 401 for unauthenticated requests", async () => {
    const response = await server.request.get("/api/buyer/buying-power");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Unauthorized",
    });
  });

  it("returns 403 for seller tokens", async () => {
    const response = await server.request
      .get("/api/buyer/buying-power")
      .set(
        "Authorization",
        `Bearer ${await signAccessToken({
          userId: randomUUID(),
          role: "SELLER",
          companyId: randomUUID(),
        })}`,
      );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden",
    });
  });

  it("returns the standard 5000 deposit ceiling and current leading bids as strings", async () => {
    const buyer = await createBuyer(database.prisma, "api");
    const firstAuction = await createAuction(database.prisma, "BMW");
    const secondAuction = await createAuction(database.prisma, "Audi");
    const losingAuction = await createAuction(database.prisma, "Lexus");

    await database.prisma.depositLock.create({
      data: {
        companyId: buyer.companyId,
        amount: FIVE_THOUSAND,
        buyingPowerCeiling: THREE_HUNDRED_THOUSAND,
        status: "ACTIVE",
      },
    });
    await database.prisma.buyerBidSummary.create({
      data: {
        companyId: buyer.companyId,
        activeBidsTotal: money(150_000),
      },
    });

    const leadingBidOne = await database.prisma.bid.create({
      data: {
        auctionId: firstAuction.auctionId,
        companyId: buyer.companyId,
        userId: buyer.userId,
        amount: money(100_000),
        sequenceNo: 1,
      },
    });
    const leadingBidTwo = await database.prisma.bid.create({
      data: {
        auctionId: secondAuction.auctionId,
        companyId: buyer.companyId,
        userId: buyer.userId,
        amount: money(50_000),
        sequenceNo: 1,
      },
    });
    await database.prisma.bid.create({
      data: {
        auctionId: losingAuction.auctionId,
        companyId: buyer.companyId,
        userId: buyer.userId,
        amount: money(40_000),
        sequenceNo: 1,
      },
    });
    const outsiderBid = await database.prisma.bid.create({
      data: {
        auctionId: losingAuction.auctionId,
        companyId: randomUUID(),
        userId: buyer.userId,
        amount: money(45_000),
        sequenceNo: 2,
      },
    });

    await database.prisma.auction.update({
      where: {
        id: firstAuction.auctionId,
      },
      data: {
        highestBidId: leadingBidOne.id,
        currentPrice: leadingBidOne.amount,
      },
    });
    await database.prisma.auction.update({
      where: {
        id: secondAuction.auctionId,
      },
      data: {
        highestBidId: leadingBidTwo.id,
        currentPrice: leadingBidTwo.amount,
      },
    });
    await database.prisma.auction.update({
      where: {
        id: losingAuction.auctionId,
      },
      data: {
        highestBidId: outsiderBid.id,
        currentPrice: outsiderBid.amount,
      },
    });

    const response = await server.request
      .get("/api/buyer/buying-power")
      .set(
        "Authorization",
        `Bearer ${await signAccessToken({
          userId: buyer.userId,
          role: "BUYER",
          companyId: buyer.companyId,
          kycVerified: true,
        })}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.depositAmount).toBe("5000.00");
    expect(response.body.ceiling).toBe("300000.00");
    expect(response.body.activeBidsTotal).toBe("150000.00");
    expect(response.body.remaining).toBe("150000.00");
    expect(response.body.activeBids).toEqual(
      expect.arrayContaining([
        {
          auctionId: firstAuction.auctionId,
          lotTitle: "BMW Model",
          amount: "100000.00",
        },
        {
          auctionId: secondAuction.auctionId,
          lotTitle: "Audi Model",
          amount: "50000.00",
        },
      ]),
    );
    expect(response.body.activeBids).toHaveLength(2);
  });
});
