import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const userFindUnique = vi.fn();
  const bidRequestUpdate = vi.fn();

  return {
    mockTx: {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      user: {
        findUnique: userFindUnique,
      },
      bid: {
        create: vi.fn(),
      },
      bidRequest: {
        update: bidRequestUpdate,
      },
      auditLog: {
        create: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
      },
      depositLock: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      depositWallet: {
        findUnique: vi.fn(),
      },
      buyerBidSummary: {
        update: vi.fn(),
      },
    },
    mockPrisma: {
      auction: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      bid: {
        findMany: vi.fn(),
      },
      company: {
        findMany: vi.fn(),
      },
      user: {
        findUnique: userFindUnique,
        findMany: vi.fn(),
      },
      bidRequest: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: bidRequestUpdate,
      },
      $transaction: vi.fn(),
      $disconnect: vi.fn(),
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

const { mockPublishAuctionRealtimeSnapshot } = vi.hoisted(() => ({
  mockPublishAuctionRealtimeSnapshot: vi.fn().mockResolvedValue(true),
}));

const { mockNotifyEventRuntime } = vi.hoisted(() => ({
  mockNotifyEventRuntime: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));
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
vi.mock("../auction-ws", () => ({
  auctionWsRoutes: async () => {},
  publishAuctionRealtimeSnapshot: mockPublishAuctionRealtimeSnapshot,
  closeAuctionRealtime: vi.fn(),
  getAuctionSnapshot: vi.fn(),
}));

vi.mock("../auction-events", () => ({
  auctionEventsRoutes: async () => {},
  notifyEventRuntime: mockNotifyEventRuntime,
  closeEventRuntimeRealtime: vi.fn(),
  getEventRuntimeSnapshot: vi.fn(),
  createAuctionEventRecord: vi.fn(),
}));

import { buildServer } from "../../server";

const jwtSecret = "test-secret-32-chars-long-enough!!";
const buyerId = randomUUID();
const companyId = randomUUID();
const auctionId = randomUUID();
const bidId = randomUUID();
const BUYING_POWER_CEILING = new Prisma.Decimal(300_000);

function decimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

async function makeToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);

  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function makeRequestHash(input: {
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

function makeLiveAuctionRow(
  overrides: Partial<{
    id: string;
    state: string;
    current_price: number;
    min_increment: number;
    starts_at: Date;
    ends_at: Date;
    last_bid_sequence: number;
    version: number;
  }> = {},
) {
  return {
    id: overrides.id ?? auctionId,
    state: overrides.state ?? "LIVE",
    current_price: overrides.current_price ?? 50_000,
    min_increment: overrides.min_increment ?? 500,
    starts_at: overrides.starts_at ?? new Date(Date.now() + 30 * 60 * 1000),
    ends_at: overrides.ends_at ?? new Date(Date.now() + 30 * 60 * 1000),
    last_bid_sequence: overrides.last_bid_sequence ?? 5,
    version: overrides.version ?? 3,
  };
}

function makeBidRecord(
  overrides: Partial<{
    id: string;
    amount: number;
    sequenceNo: number;
    createdAt: Date;
    auctionId: string;
    companyId: string;
    userId: string;
  }> = {},
) {
  return {
    id: overrides.id ?? bidId,
    amount: overrides.amount ?? 51_000,
    createdAt: overrides.createdAt ?? new Date("2026-03-14T09:00:00.000Z"),
    companyId: overrides.companyId ?? companyId,
    userId: overrides.userId ?? buyerId,
    auctionId: overrides.auctionId ?? auctionId,
  };
}

function configureBuyingPowerSuccess(activeBidsTotal: number): void {
  mockBuyingPowerCommands.initializeBuyerBidSummary.mockResolvedValue(undefined);
  mockBuyingPowerCommands.primeBuyingPowerState.mockResolvedValue({});
  mockBuyingPowerCommands.acquireOrVerifyBuyingPowerLock.mockResolvedValue({
    allowed: true,
    currentTotal: decimal(0),
    ceiling: BUYING_POWER_CEILING,
    remaining: BUYING_POWER_CEILING.minus(activeBidsTotal),
  });
  mockBuyingPowerCommands.releaseLeadingBidOnOutbid.mockResolvedValue({
    activeBidsTotal: decimal(0),
    ceiling: BUYING_POWER_CEILING,
    remaining: BUYING_POWER_CEILING,
  });
  mockBuyingPowerCommands.recordLeadingBid.mockResolvedValue({
    activeBidsTotal: decimal(activeBidsTotal),
    ceiling: BUYING_POWER_CEILING,
    remaining: BUYING_POWER_CEILING.minus(activeBidsTotal),
  });
  mockBuyingPowerCommands.readBuyingPowerSnapshot.mockResolvedValue({
    activeBidsTotal: decimal(activeBidsTotal),
    ceiling: BUYING_POWER_CEILING,
    remaining: BUYING_POWER_CEILING.minus(activeBidsTotal),
  });
}

function setupBidQuerySequence(options: {
  auctionRow?: ReturnType<typeof makeLiveAuctionRow> | null;
  previousLeaderPreview?: Array<Record<string, unknown>>;
  previousLeader?: Array<Record<string, unknown>>;
}): void {
  mockTx.$queryRaw.mockReset();
  mockTx.$queryRaw.mockResolvedValueOnce(options.previousLeaderPreview ?? []);
  mockTx.$queryRaw.mockResolvedValueOnce(
    options.auctionRow === null ? [] : [options.auctionRow ?? makeLiveAuctionRow()],
  );
  mockTx.$queryRaw.mockResolvedValueOnce(options.previousLeader ?? []);
}

function makeAuctionDetails() {
  return {
    id: auctionId,
    state: "LIVE",
    version: 7,
    currentPrice: 50_000,
    minIncrement: 500,
    startingPrice: 45_000,
    buyNowPrice: null,
    startsAt: new Date("2026-03-14T08:00:00.000Z"),
    endsAt: new Date("2026-03-14T10:00:00.000Z"),
    extensionCount: 0,
    highestBidId: bidId,
    vehicle: {
      id: randomUUID(),
      brand: "Toyota",
      model: "Land Cruiser",
      year: 2022,
      mileage: 15_000,
      vin: "JTMHX3JH50D123456",
      marketPrice: 55_000,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "SUV",
      regionSpec: "GCC",
      condition: "USED",
      serviceHistory: "Full",
      description: "Clean example",
      engine: "3.5L",
      driveType: "4WD",
      exteriorColor: "White",
      interiorColor: "Black",
      airbags: "Full",
      damage: "None",
      damageMap: null,
      images: ["https://example.com/vehicle.jpg"],
    },
    bids: [
      {
        id: bidId,
        auctionId,
        companyId,
        userId: buyerId,
        amount: 50_000,
        sequenceNo: 5,
        createdAt: new Date("2026-03-14T08:45:00.000Z"),
      },
    ],
  };
}

function makeBidList(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeBidRecord({
      id: randomUUID(),
      amount: 50_000 + (count - index) * 500,
      sequenceNo: count - index,
      createdAt: new Date(Date.now() - index * 1_000),
    }),
  );
}

function setupTransactionSuccess(): void {
  mockPrisma.$transaction.mockImplementation(async (callback, options) => {
    expect(options).toEqual({
      isolationLevel: "Serializable",
    });

    return callback(mockTx);
  });
}

let server: FastifyInstance;
let request: ReturnType<typeof supertest>;
let buyerToken: string;

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "test";
  server = await buildServer();
  await server.ready();
  request = supertest(server.server);
  buyerToken = await makeToken({
    userId: buyerId,
    role: "BUYER",
    companyId,
  });
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPublishAuctionRealtimeSnapshot.mockResolvedValue(true);
  mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
    kind: "success",
    statusCode: 201,
    bidId: bidId,
    body: {
      bid: {
        id: bidId,
        auctionId,
        amount: "51000.00",
        createdAt: "2026-03-14T09:00:00.000Z",
      },
      buyingPower: {
        activeBidsTotal: "51000.00",
        ceiling: "300000.00",
        remaining: "249000.00",
      },
    },
  });
  configureBuyingPowerSuccess(51_000);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: buyerId,
    role: "BUYER",
    status: "ACTIVE",
    kycVerified: true,
    companyUsers: [
      {
        companyId,
        company: {
          status: "ACTIVE",
        },
      },
    ],
  });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.company.findMany.mockResolvedValue([]);
  mockTx.auditLog.create.mockResolvedValue({});
  mockTx.outboxEvent.create.mockResolvedValue({});
  mockTx.depositLock.updateMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/bids", () => {
  const validBody = {
    auctionId,
    amount: 51_000,
    idempotencyKey: "idem-key-001",
  } as const;

  it("returns 401 without auth token", async () => {
    const res = await request.post("/api/bids").send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 when auth token has no companyId", async () => {
    const tokenWithoutCompany = await makeToken({
      userId: buyerId,
      role: "BUYER",
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${tokenWithoutCompany}`)
      .send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 403 when buyer account is pending approval", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: buyerId,
      role: "BUYER",
      status: "PENDING_APPROVAL",
      kycVerified: false,
      companyUsers: [
        {
          companyId,
          company: {
            status: "PENDING_APPROVAL",
          },
        },
      ],
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ACCOUNT_PENDING_APPROVAL");
  });

  it("returns 400 when auctionId is missing", async () => {
    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ amount: 51_000, idempotencyKey: "idem-key-001" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("returns 400 when amount is zero", async () => {
    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, amount: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is negative", async () => {
    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, amount: -100 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when idempotencyKey is empty", async () => {
    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, idempotencyKey: "" });

    expect(res.status).toBe(400);
  });

  it("returns cached response when bid request already SUCCEEDED", async () => {
    const cachedResponse = {
      bid: {
        id: bidId,
        auctionId,
        amount: "51000.00",
        createdAt: "2026-03-14T09:00:00.000Z",
      },
      buyingPower: {
        activeBidsTotal: "51000.00",
        ceiling: "300000.00",
        remaining: "249000.00",
      },
    };
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "replay",
      statusCode: 201,
      bidId,
      body: cachedResponse,
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(cachedResponse);
    expect(mockPrisma.bidRequest.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns cached failed response when bid request was previously REJECTED", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_INSUFFICIENT_DEPOSIT",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_INSUFFICIENT_DEPOSIT");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when bid request is already in progress", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 409,
      bidId: null,
      body: {
        error: "BID_REQUEST_IN_PROGRESS",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("BID_REQUEST_IN_PROGRESS");
  });

  it("returns 409 when idempotency key was reused for a different bid", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 409,
      bidId: null,
      body: {
        error: "BID_IDEMPOTENCY_CONFLICT",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("BID_IDEMPOTENCY_CONFLICT");
  });

  it("returns 201 and serializes bid data for a valid bid", async () => {
    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.bid.amount).toBe("51000.00");
    expect(res.body.bid.auctionId).toBe(auctionId);
    expect(res.body.bid.createdAt).toBe("2026-03-14T09:00:00.000Z");
    expect(res.body.buyingPower).toEqual({
      activeBidsTotal: "51000.00",
      ceiling: "300000.00",
      remaining: "249000.00",
    });
    expect(mockPlaceBidCommand.executePlaceBidCommand).toHaveBeenCalledWith(mockPrisma, {
      auctionId,
      amount: 51_000,
      companyId,
      idempotencyKey: "idem-key-001",
      userId: buyerId,
    });
    expect(mockPublishAuctionRealtimeSnapshot).toHaveBeenCalledWith(auctionId, server.log);
  });

  it("runs anti-sniping extension when less than three minutes remain", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "success",
      statusCode: 201,
      bidId,
      body: {
        bid: {
          id: bidId,
          auctionId,
          amount: "51000.00",
          createdAt: "2026-03-14T09:00:00.000Z",
        },
        buyingPower: {
          activeBidsTotal: "51000.00",
          ceiling: "300000.00",
          remaining: "249000.00",
        },
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(mockPlaceBidCommand.executePlaceBidCommand).toHaveBeenCalledOnce();
  });

  it("returns 409 when auction is not active", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_AUCTION_NOT_LIVE",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_AUCTION_NOT_LIVE");
  });

  it("returns 409 when auction has already ended", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_AUCTION_NOT_LIVE",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_AUCTION_NOT_LIVE");
  });

  it("returns 422 when bid amount is not higher than current price", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_INCREMENT_TOO_LOW",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_INCREMENT_TOO_LOW");
  });

  it("returns 422 when bid does not meet minimum increment", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_INCREMENT_TOO_LOW",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, amount: 50_500 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_INCREMENT_TOO_LOW");
  });

  it("returns 403 when no active deposit lock exists", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_INSUFFICIENT_DEPOSIT",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_INSUFFICIENT_DEPOSIT");
  });

  it("accepts the first manual pre-bid for a scheduled auction", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "success",
      statusCode: 201,
      bidId,
      body: {
        bid: {
          id: bidId,
          auctionId,
          amount: "3000.00",
          createdAt: "2026-03-14T09:00:00.000Z",
        },
        buyingPower: {
          activeBidsTotal: "3000.00",
          ceiling: "300000.00",
          remaining: "297000.00",
        },
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, amount: 3_000, idempotencyKey: "idem-scheduled-1" });

    expect(res.status).toBe(201);
    expect(res.body.bid.amount).toBe("3000.00");
  });

  it("rejects a scheduled pre-bid that skips the exact AED 500 increment", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_INCREMENT_TOO_LOW",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, amount: 3_600, idempotencyKey: "idem-scheduled-2" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_INCREMENT_TOO_LOW");
  });

  it("accepts bidding on a scheduled auction after its start time and promotes it to LIVE", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "success",
      statusCode: 201,
      bidId,
      body: {
        bid: {
          id: bidId,
          auctionId,
          amount: "500.00",
          createdAt: "2026-03-14T09:00:00.000Z",
        },
        buyingPower: {
          activeBidsTotal: "500.00",
          ceiling: "300000.00",
          remaining: "299500.00",
        },
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, amount: 500, idempotencyKey: "idem-scheduled-live-1" });

    expect(res.status).toBe(201);
    expect(res.body.bid.amount).toBe("500.00");
    expect(mockPublishAuctionRealtimeSnapshot).toHaveBeenCalledWith(auctionId, expect.anything());
  });

  it("returns 409 when locked auction row is missing", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 422,
      bidId: null,
      body: {
        error: "BID_AUCTION_NOT_LIVE",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BID_AUCTION_NOT_LIVE");
  });

  it("returns 409 when optimistic lock update affects zero rows after one retry", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockResolvedValue({
      kind: "rejected",
      statusCode: 409,
      bidId: null,
      body: {
        error: "BID_OPTIMISTIC_CONFLICT",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("BID_OPTIMISTIC_CONFLICT");
  });

  it("marks BidRequest as SUCCEEDED after a successful bid", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockImplementation(async () => {
      await mockPrisma.bidRequest.update({
        where: {
          id: "req-14",
        },
        data: {
          status: "SUCCEEDED",
          responseStatus: 201,
          bidId: bidId,
          responseBody: {
            bid: {
              id: bidId,
              auctionId,
              amount: "51000.00",
              createdAt: "2026-03-14T09:00:00.000Z",
            },
            buyingPower: {
              activeBidsTotal: "51000.00",
              ceiling: "300000.00",
              remaining: "249000.00",
            },
          },
        },
      });

      return {
        kind: "success",
        statusCode: 201,
        bidId,
        body: {
          bid: {
            id: bidId,
            auctionId,
            amount: "51000.00",
            createdAt: "2026-03-14T09:00:00.000Z",
          },
          buyingPower: {
            activeBidsTotal: "51000.00",
            ceiling: "300000.00",
            remaining: "249000.00",
          },
        },
      };
    });

    await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(mockPrisma.bidRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "req-14",
        },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          responseStatus: 201,
          bidId: bidId,
          responseBody: {
            bid: {
              id: bidId,
              auctionId,
              amount: "51000.00",
              createdAt: "2026-03-14T09:00:00.000Z",
            },
            buyingPower: {
              activeBidsTotal: "51000.00",
              ceiling: "300000.00",
              remaining: "249000.00",
            },
          },
        }),
      }),
    );
  });

  it("marks BidRequest as REJECTED for business rule failures", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockImplementation(async () => {
      await mockPrisma.bidRequest.update({
        where: {
          id: "req-15",
        },
        data: {
          status: "REJECTED",
          responseStatus: 422,
          responseBody: {
            error: "BID_AUCTION_NOT_LIVE",
          },
        },
      });

      return {
        kind: "rejected",
        statusCode: 422,
        bidId: null,
        body: {
          error: "BID_AUCTION_NOT_LIVE",
        },
      };
    });

    await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(mockPrisma.bidRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "req-15",
        },
        data: expect.objectContaining({
          status: "REJECTED",
          responseStatus: 422,
          responseBody: {
            error: "BID_AUCTION_NOT_LIVE",
          },
        }),
      }),
    );
  });

  it("marks BidRequest as FAILED for unexpected transaction errors", async () => {
    mockPlaceBidCommand.executePlaceBidCommand.mockImplementation(async () => {
      await mockPrisma.bidRequest.update({
        where: {
          id: "req-16",
        },
        data: {
          status: "FAILED",
          responseStatus: 500,
          responseBody: {
            error: "INTERNAL_ERROR",
          },
        },
      });

      return {
        kind: "rejected",
        statusCode: 500,
        bidId: null,
        body: {
          error: "INTERNAL_ERROR",
        },
      };
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("INTERNAL_ERROR");
    expect(mockPrisma.bidRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "req-16",
        },
        data: expect.objectContaining({
          status: "FAILED",
          responseStatus: 500,
        }),
      }),
    );
  });
});

describe("GET /api/auctions/:id", () => {
  it("returns 200 with auction details", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(makeAuctionDetails());

    const res = await request.get(`/api/auctions/${auctionId}`);

    expect(res.status).toBe(200);
    expect(res.body.auction.id).toBe(auctionId);
    expect(res.body.auction.state).toBe("LIVE");
    expect(typeof res.body.auction.currentPrice).toBe("number");
    expect(res.body.auction.vehicle.brand).toBe("Toyota");
  });

  it("returns buy now price in public auction details", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue({
      ...makeAuctionDetails(),
      buyNowPrice: 72_500,
    });

    const res = await request.get(`/api/auctions/${auctionId}`);

    expect(res.status).toBe(200);
    expect(res.body.auction.buyNowPrice).toBe(72_500);
  });

  it("returns recent bids nested under auction", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(makeAuctionDetails());

    const res = await request.get(`/api/auctions/${auctionId}`);

    expect(Array.isArray(res.body.auction.bids)).toBe(true);
    expect(res.body.auction.bids).toHaveLength(1);
    expect(typeof res.body.auction.bids[0].amount).toBe("number");
  });

  it("serializes auction dates as ISO strings", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(makeAuctionDetails());

    const res = await request.get(`/api/auctions/${auctionId}`);

    expect(typeof res.body.auction.startsAt).toBe("string");
    expect(typeof res.body.auction.endsAt).toBe("string");
  });

  it("returns 404 when auction does not exist", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(null);

    const res = await request.get(`/api/auctions/${randomUUID()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Auction not found");
  });

  it("returns 404 when auction is sold and no longer public", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue({
      ...makeAuctionDetails(),
      state: "PAYMENT_PENDING",
    });

    const res = await request.get(`/api/auctions/${auctionId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Auction not found");
  });

  it("does not require auth token", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(makeAuctionDetails());

    const res = await request.get(`/api/auctions/${auctionId}`);

    expect(res.status).toBe(200);
  });
});

describe("GET /api/auctions", () => {
  it("returns public auction listings", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: auctionId,
        sellerCompanyId: companyId,
        state: "SCHEDULED",
        currentPrice: 125000,
        minIncrement: 500,
        startingPrice: 120000,
        buyNowPrice: null,
        startsAt: new Date("2026-03-29T08:00:00.000Z"),
        endsAt: new Date("2026-03-30T08:00:00.000Z"),
        createdAt: new Date("2026-03-15T08:00:00.000Z"),
        vehicle: {
          id: "vehicle-1",
          brand: "BMW",
          model: "M4",
          year: 2024,
          mileage: 12000,
          vin: "VIN12345",
          marketPrice: null,
          fuelType: "Petrol",
          transmission: "Automatic",
          bodyType: "Coupe",
          regionSpec: "GCC",
          condition: "Excellent",
          serviceHistory: "Dealer",
          description: "Ready for sale",
          engine: "3.0L",
          driveType: "RWD",
          exteriorColor: "Blue",
          interiorColor: "Black",
          airbags: "Intact",
          damage: "None",
          damageMap: null,
          images: ["/uploads/test.jpg"],
        },
      },
    ]);
    mockPrisma.company.findMany.mockResolvedValue([
      {
        id: companyId,
        name: "Test Fleet",
        country: "Dubai",
      },
    ]);

    const res = await request.get("/api/auctions");

    expect(res.status).toBe(200);
    expect(res.body.auctions).toHaveLength(1);
    expect(res.body.auctions[0].id).toBe(auctionId);
    expect(res.body.auctions[0].sellerName).toBe("Test Fleet");
    expect(res.body.auctions[0].vehicle.brand).toBe("BMW");
    expect(mockPrisma.auction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: {
            in: ["SCHEDULED", "LIVE", "EXTENDED"],
          },
        }),
      }),
    );
  });

  it("returns buy now price in public auction listings", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: auctionId,
        sellerCompanyId: companyId,
        state: "SCHEDULED",
        currentPrice: 125000,
        minIncrement: 500,
        startingPrice: 120000,
        buyNowPrice: 140000,
        startsAt: new Date("2026-03-29T08:00:00.000Z"),
        endsAt: new Date("2026-03-30T08:00:00.000Z"),
        createdAt: new Date("2026-03-15T08:00:00.000Z"),
        vehicle: {
          id: "vehicle-1",
          brand: "BMW",
          model: "M4",
          year: 2024,
          mileage: 12000,
          vin: "VIN12345",
          marketPrice: null,
          fuelType: "Petrol",
          transmission: "Automatic",
          bodyType: "Coupe",
          regionSpec: "GCC",
          condition: "Excellent",
          serviceHistory: "Dealer",
          description: "Ready for sale",
          engine: "3.0L",
          driveType: "RWD",
          exteriorColor: "Blue",
          interiorColor: "Black",
          airbags: "Intact",
          damage: "None",
          damageMap: null,
          images: ["/uploads/test.jpg"],
        },
      },
    ]);
    mockPrisma.company.findMany.mockResolvedValue([
      {
        id: companyId,
        name: "Test Fleet",
        country: "Dubai",
      },
    ]);

    const res = await request.get("/api/auctions");

    expect(res.status).toBe(200);
    expect(res.body.auctions).toHaveLength(1);
    expect(res.body.auctions[0].buyNowPrice).toBe(140000);
  });
});

describe("GET /api/auctions/:id/bids", () => {
  it("returns 200 with bids array", async () => {
    mockPrisma.bid.findMany.mockResolvedValue(makeBidList(5));

    const res = await request.get(`/api/auctions/${auctionId}/bids`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bids)).toBe(true);
    expect(res.body.bids).toHaveLength(5);
  });

  it("returns nextCursor when more results exist", async () => {
    mockPrisma.bid.findMany.mockResolvedValue(makeBidList(21));

    const res = await request.get(`/api/auctions/${auctionId}/bids`);

    expect(res.status).toBe(200);
    expect(res.body.bids).toHaveLength(20);
    expect(res.body.nextCursor).not.toBeNull();
  });

  it("returns nextCursor null when there is no next page", async () => {
    mockPrisma.bid.findMany.mockResolvedValue(makeBidList(5));

    const res = await request.get(`/api/auctions/${auctionId}/bids`);

    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
  });

  it("respects a custom limit query parameter", async () => {
    mockPrisma.bid.findMany.mockResolvedValue(makeBidList(3));

    const res = await request.get(`/api/auctions/${auctionId}/bids?limit=3`);

    expect(res.status).toBe(200);
    expect(mockPrisma.bid.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 4,
      }),
    );
  });

  it("passes cursor pagination to Prisma", async () => {
    mockPrisma.bid.findMany.mockResolvedValue(makeBidList(2));

    const res = await request.get(`/api/auctions/${auctionId}/bids?limit=2&cursor=cursor-1`);

    expect(res.status).toBe(200);
    expect(mockPrisma.bid.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        skip: 1,
        cursor: {
          id: "cursor-1",
        },
      }),
    );
  });

  it("returns 400 for invalid limit value", async () => {
    const res = await request.get(`/api/auctions/${auctionId}/bids?limit=0`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("returns 400 when limit exceeds maximum", async () => {
    const res = await request.get(`/api/auctions/${auctionId}/bids?limit=101`);

    expect(res.status).toBe(400);
  });

  it("serializes bid amount as a number", async () => {
    mockPrisma.bid.findMany.mockResolvedValue(makeBidList(1));

    const res = await request.get(`/api/auctions/${auctionId}/bids`);

    expect(typeof res.body.bids[0].amount).toBe("number");
  });

  it("does not require auth token", async () => {
    mockPrisma.bid.findMany.mockResolvedValue(makeBidList(2));

    const res = await request.get(`/api/auctions/${auctionId}/bids`);

    expect(res.status).toBe(200);
  });
});
