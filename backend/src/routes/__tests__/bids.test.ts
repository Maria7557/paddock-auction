import { createHash } from "node:crypto";

import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  bidRequest: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  auction: {
    findUnique: vi.fn(),
  },
  bid: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));

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
        amount: input.amount,
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
    const txMock = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "auction-1",
          state: "LIVE",
          version: 5,
          current_price: 100,
          min_increment: 10,
          last_bid_sequence: 7,
          ends_at: new Date(Date.now() + 60_000),
        },
      ]),
      depositLock: {
        findFirst: vi.fn().mockResolvedValue({
          id: "lock-1",
        }),
      },
      bid: {
        create: vi.fn().mockResolvedValue({
          id: "bid-1",
          amount: 120,
          sequenceNo: 8,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      },
      $executeRaw: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
    };

    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({
      id: "bid-request-1",
    });
    mockPrisma.bidRequest.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: "Serializable",
      });

      return callback(txMock);
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
        amount: 120,
        sequenceNo: 8,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(txMock.depositLock.findFirst).toHaveBeenCalledWith({
      where: {
        auctionId: "auction-1",
        companyId: "company-1",
        status: "ACTIVE",
      },
    });
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mockPrisma.bidRequest.update).toHaveBeenCalledWith({
      where: {
        id: "bid-request-1",
      },
      data: {
        status: "SUCCEEDED",
        responseStatus: 201,
        responseBody: {
          bid: {
            id: "bid-1",
            amount: 120,
            sequenceNo: 8,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
        bidId: "bid-1",
      },
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

    mockPrisma.bidRequest.findUnique.mockResolvedValue({
      id: "bid-request-1",
      requestHash: await buildBidRequestHash({
        auctionId: "auction-1",
        amount: 130,
        companyId: "company-1",
        userId: "user-1",
      }),
      status: "SUCCEEDED",
      responseStatus: 201,
      responseBody: {
        bid: {
          id: "bid-9",
          amount: 130,
          sequenceNo: 9,
          createdAt: "2026-01-02T00:00:00.000Z",
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
        amount: 130,
        sequenceNo: 9,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    });
    expect(mockPrisma.bidRequest.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();

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
    const txMock = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "auction-1",
          state: "LIVE",
          version: 5,
          current_price: 100,
          min_increment: 10,
          last_bid_sequence: 7,
          ends_at: new Date(Date.now() + 600_000),
        },
      ]),
      depositLock: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      bid: {
        create: vi.fn(),
      },
      $executeRaw: vi.fn(),
    };

    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({
      id: "bid-request-2",
    });
    mockPrisma.bidRequest.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(txMock));

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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Deposit required to bid",
    });
    expect(mockPrisma.bidRequest.update).toHaveBeenCalledWith({
      where: {
        id: "bid-request-2",
      },
      data: {
        status: "REJECTED",
        responseStatus: 403,
        responseBody: {
          error: "Deposit required to bid",
        },
      },
    });

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
        },
        {
          id: "bid-2",
          auctionId: "auction-1",
          companyId: "company-2",
          userId: "user-2",
          amount: 120,
          sequenceNo: 2,
          createdAt: "2026-01-01T10:01:00.000Z",
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
