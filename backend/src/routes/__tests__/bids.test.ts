import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  const userFindUnique = vi.fn();
  const bidRequestUpdate = vi.fn();

  return {
    mockPrisma: {
      user: {
        findUnique: userFindUnique,
        findMany: vi.fn(),
      },
      company: {
        findMany: vi.fn(),
      },
      bidRequest: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: bidRequestUpdate,
      },
      auction: {
        findUnique: vi.fn(),
      },
      bid: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

const { mockBuyingPowerCommands, MockBuyingPowerCommandError } = vi.hoisted(() => {
  class MockBuyingPowerCommandError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown> | undefined;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.name = "BuyingPowerCommandError";
      this.code = code;
      this.details = details;
    }
  }

  return {
    MockBuyingPowerCommandError,
    mockBuyingPowerCommands: {
      initializeBuyerBidSummary: vi.fn(),
      primeBuyingPowerState: vi.fn(),
      acquireOrVerifyBuyingPowerLock: vi.fn(),
      releaseLeadingBidOnOutbid: vi.fn(),
      recordLeadingBid: vi.fn(),
      readBuyingPowerSnapshot: vi.fn(),
    },
  };
});

const { mockPlaceBidCommand } = vi.hoisted(() => ({
  mockPlaceBidCommand: {
    executePlaceBidCommand: vi.fn(),
  },
}));

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));
vi.mock("../../modules/bidding/application/place_bid", () => ({
  executePlaceBidCommand: mockPlaceBidCommand.executePlaceBidCommand,
}));
vi.mock("../../modules/deposits/application/deposit_commands", () => ({
  BuyingPowerCommandError: MockBuyingPowerCommandError,
  initializeBuyerBidSummary: mockBuyingPowerCommands.initializeBuyerBidSummary,
  primeBuyingPowerState: mockBuyingPowerCommands.primeBuyingPowerState,
  acquireOrVerifyBuyingPowerLock: mockBuyingPowerCommands.acquireOrVerifyBuyingPowerLock,
  releaseLeadingBidOnOutbid: mockBuyingPowerCommands.releaseLeadingBidOnOutbid,
  recordLeadingBid: mockBuyingPowerCommands.recordLeadingBid,
  readBuyingPowerSnapshot: mockBuyingPowerCommands.readBuyingPowerSnapshot,
}));

vi.mock("../auction-events", () => ({
  notifyEventRuntime: vi.fn().mockResolvedValue(true),
}));

const BUYING_POWER_CEILING = new Prisma.Decimal(300_000);

function decimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

async function signToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
  email?: string;
}): Promise<string> {
  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function buildBidRequestHash(input: {
  auctionId: string;
  amount: number;
  companyId: string;
  userId: string;
}): Promise<string> {
  return createHash("sha256")
    .update(
      JSON.stringify({
        auctionId: input.auctionId,
        amount: input.amount.toFixed(2),
        companyId: input.companyId,
        userId: input.userId,
      }),
    )
    .digest("hex");
}

async function buildTestServer(): Promise<FastifyInstance> {
  const { bidsRoutes } = await import("../bids");
  const server = Fastify();

  await server.register(cookie);
  await server.register(bidsRoutes);
  await server.ready();

  return server;
}

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-32-chars-long-enough!!";
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPlaceBidCommand.executePlaceBidCommand.mockReset();
  mockBuyingPowerCommands.initializeBuyerBidSummary.mockResolvedValue(undefined);
  mockBuyingPowerCommands.primeBuyingPowerState.mockResolvedValue({});
  mockBuyingPowerCommands.acquireOrVerifyBuyingPowerLock.mockResolvedValue({
    allowed: true,
    currentTotal: decimal(0),
    ceiling: BUYING_POWER_CEILING,
    remaining: decimal(299_880),
  });
  mockBuyingPowerCommands.releaseLeadingBidOnOutbid.mockResolvedValue({
    activeBidsTotal: decimal(0),
    ceiling: BUYING_POWER_CEILING,
    remaining: BUYING_POWER_CEILING,
  });
  mockBuyingPowerCommands.recordLeadingBid.mockResolvedValue({
    activeBidsTotal: decimal(120),
    ceiling: BUYING_POWER_CEILING,
    remaining: decimal(299_880),
  });
  mockBuyingPowerCommands.readBuyingPowerSnapshot.mockResolvedValue({
    activeBidsTotal: decimal(120),
    ceiling: BUYING_POWER_CEILING,
    remaining: decimal(299_880),
  });
  mockPrisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    role: "BUYER",
    status: "ACTIVE",
    kycVerified: true,
    companyUsers: [
      {
        companyId: "company-1",
        company: {
          status: "ACTIVE",
        },
      },
    ],
  });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.company.findMany.mockResolvedValue([]);
});

afterEach(async () => {
  vi.resetModules();
});

describe("bidsRoutes", () => {
  it("places a bid in a Serializable transaction and applies anti-sniping extension", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
    });
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "success",
      statusCode: 201,
      bidId: "bid-1",
      body: {
        bid: {
          id: "bid-1",
          auctionId: "auction-1",
          amount: "120.00",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        buyingPower: {
          activeBidsTotal: "120.00",
          ceiling: "300000.00",
          remaining: "299880.00",
        },
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/bids",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        auctionId: "auction-1",
        amount: 120,
        idempotencyKey: "idem-1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      bid: {
        id: "bid-1",
        auctionId: "auction-1",
        amount: "120.00",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      buyingPower: {
        activeBidsTotal: "120.00",
        ceiling: "300000.00",
        remaining: "299880.00",
      },
    });
    expect(mockPlaceBidCommand.executePlaceBidCommand).toHaveBeenCalledWith(mockPrisma, {
      auctionId: "auction-1",
      amount: 120,
      companyId: "company-1",
      idempotencyKey: "idem-1",
      userId: "user-1",
    });

    await server.close();
  });

  it("replays a succeeded bid request from cache", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
    });

    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "replay",
      statusCode: 201,
      bidId: "bid-9",
      body: {
        bid: {
          id: "bid-9",
          auctionId: "auction-1",
          amount: "130.00",
          createdAt: "2026-01-02T00:00:00.000Z",
        },
        buyingPower: {
          activeBidsTotal: "130.00",
          ceiling: "300000.00",
          remaining: "299870.00",
        },
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/bids",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        auctionId: "auction-1",
        amount: 130,
        idempotencyKey: "idem-1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      bid: {
        id: "bid-9",
        auctionId: "auction-1",
        amount: "130.00",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      buyingPower: {
        activeBidsTotal: "130.00",
        ceiling: "300000.00",
        remaining: "299870.00",
      },
    });
    expect(mockPlaceBidCommand.executePlaceBidCommand).toHaveBeenCalledOnce();

    await server.close();
  });

  it("returns 403 when no active deposit lock exists", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
    });
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_INSUFFICIENT_DEPOSIT",
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/bids",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        auctionId: "auction-1",
        amount: 120,
        idempotencyKey: "idem-2",
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "BID_INSUFFICIENT_DEPOSIT",
    });
    expect(mockPlaceBidCommand.executePlaceBidCommand).toHaveBeenCalledOnce();

    await server.close();
  });

  it("returns auction details with vehicle and recent bids", async () => {
    const server = await buildTestServer();

    mockPrisma.auction.findUnique.mockResolvedValue({
      id: "auction-1",
      state: "LIVE",
      version: 3,
      currentPrice: "100.50",
      minIncrement: "10.00",
      startingPrice: "80.00",
      buyNowPrice: "150.00",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-01-02T00:00:00.000Z"),
      extensionCount: 1,
      highestBidId: "bid-10",
      vehicle: {
        id: "vehicle-1",
        brand: "Toyota",
        model: "Corolla",
        year: 2020,
        mileage: 10000,
        vin: "VIN123",
        marketPrice: "120.00",
        fuelType: "Petrol",
        transmission: "Automatic",
        bodyType: "Sedan",
        regionSpec: "GCC",
        condition: "Used",
        serviceHistory: "Full",
        description: "Clean",
        engine: "2.0",
        driveType: "FWD",
        exteriorColor: "White",
        interiorColor: "Black",
        airbags: "Front",
        damage: "None",
        damageMap: null,
        images: ["one.jpg"],
      },
      bids: [
        {
          id: "bid-10",
          auctionId: "auction-1",
          companyId: "company-1",
          userId: "user-1",
          amount: "100.50",
          sequenceNo: 10,
          createdAt: new Date("2026-01-01T10:00:00.000Z"),
        },
      ],
    });

    const response = await server.inject({
      method: "GET",
      url: "/auctions/auction-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      auction: {
        id: "auction-1",
        state: "LIVE",
        version: 3,
        currentPrice: 100.5,
        minIncrement: 10,
        startingPrice: 80,
        buyNowPrice: 150,
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2026-01-02T00:00:00.000Z",
        extensionCount: 1,
        highestBidId: "bid-10",
        vehicle: {
          id: "vehicle-1",
          brand: "Toyota",
          model: "Corolla",
          year: 2020,
          mileage: 10000,
          vin: "VIN123",
          marketPrice: 120,
          fuelType: "Petrol",
          transmission: "Automatic",
          bodyType: "Sedan",
          regionSpec: "GCC",
          condition: "Used",
          serviceHistory: "Full",
          description: "Clean",
          engine: "2.0",
          driveType: "FWD",
          exteriorColor: "White",
          interiorColor: "Black",
          airbags: "Front",
          damage: "None",
          damageMap: null,
          images: ["one.jpg"],
        },
        bids: [
          {
            id: "bid-10",
            auctionId: "auction-1",
            companyId: "company-1",
            userId: "user-1",
            amount: 100.5,
            sequenceNo: 10,
            createdAt: "2026-01-01T10:00:00.000Z",
          },
        ],
      },
    });

    await server.close();
  });

  it("returns paginated bid history with nextCursor", async () => {
    const server = await buildTestServer();

    mockPrisma.company.findMany.mockResolvedValue([
      { id: "company-3", name: "Market Kingdom", country: "Saudi Arabia" },
      { id: "company-2", name: "Doha Motors", country: "Qatar" },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "user-3", emirate: "Riyadh" },
      { id: "user-2", emirate: "Doha" },
    ]);
    mockPrisma.bid.findMany.mockResolvedValue([
      {
        id: "bid-3",
        auctionId: "auction-1",
        companyId: "company-3",
        userId: "user-3",
        amount: "130.00",
        sequenceNo: 3,
        createdAt: new Date("2026-01-01T10:02:00.000Z"),
      },
      {
        id: "bid-2",
        auctionId: "auction-1",
        companyId: "company-2",
        userId: "user-2",
        amount: "120.00",
        sequenceNo: 2,
        createdAt: new Date("2026-01-01T10:01:00.000Z"),
      },
      {
        id: "bid-1",
        auctionId: "auction-1",
        companyId: "company-1",
        userId: "user-1",
        amount: "110.00",
        sequenceNo: 1,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      },
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/auctions/auction-1/bids?limit=2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      bids: [
        {
          id: "bid-3",
          auctionId: "auction-1",
          companyId: "company-3",
          userId: "user-3",
          amount: 130,
          sequenceNo: 3,
          createdAt: "2026-01-01T10:02:00.000Z",
          companyName: "Market Kingdom",
          companyInitials: "MK",
          country: "Saudi Arabia",
          city: "Riyadh",
          locationLabel: "Riyadh, Saudi Arabia",
          flag: "🇸🇦",
          isMine: false,
        },
        {
          id: "bid-2",
          auctionId: "auction-1",
          companyId: "company-2",
          userId: "user-2",
          amount: 120,
          sequenceNo: 2,
          createdAt: "2026-01-01T10:01:00.000Z",
          companyName: "Doha Motors",
          companyInitials: "DM",
          country: "Qatar",
          city: "Doha",
          locationLabel: "Doha, Qatar",
          flag: "🇶🇦",
          isMine: false,
        },
      ],
      nextCursor: "bid-2",
    });
    expect(mockPrisma.bid.findMany).toHaveBeenCalledWith({
      where: {
        auctionId: "auction-1",
      },
      take: 3,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    await server.close();
  });
});
