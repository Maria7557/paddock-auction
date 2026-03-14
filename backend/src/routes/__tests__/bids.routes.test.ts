import { createHash, randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockTx, mockPrisma } = vi.hoisted(() => ({
  mockTx: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    bid: {
      create: vi.fn(),
    },
    depositLock: {
      findFirst: vi.fn(),
    },
  },
  mockPrisma: {
    auction: {
      findUnique: vi.fn(),
    },
    bid: {
      findMany: vi.fn(),
    },
    bidRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));

import { buildServer } from "../../server";

const jwtSecret = "test-secret-32-chars-long-enough!!";
const buyerId = randomUUID();
const companyId = randomUUID();
const auctionId = randomUUID();
const bidId = randomUUID();

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
        amount: input.amount,
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
    sequenceNo: overrides.sequenceNo ?? 6,
    createdAt: overrides.createdAt ?? new Date("2026-03-14T09:00:00.000Z"),
    companyId: overrides.companyId ?? companyId,
    userId: overrides.userId ?? buyerId,
    auctionId: overrides.auctionId ?? auctionId,
  };
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
        amount: 51_000,
        sequenceNo: 6,
        createdAt: "2026-03-14T09:00:00.000Z",
      },
    };
    const requestHash = await makeRequestHash({
      auctionId,
      amount: validBody.amount,
      companyId,
      userId: buyerId,
    });

    mockPrisma.bidRequest.findUnique.mockResolvedValue({
      id: "req-1",
      requestHash,
      status: "SUCCEEDED",
      responseStatus: 201,
      responseBody: cachedResponse,
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
    const requestHash = await makeRequestHash({
      auctionId,
      amount: validBody.amount,
      companyId,
      userId: buyerId,
    });

    mockPrisma.bidRequest.findUnique.mockResolvedValue({
      id: "req-2",
      requestHash,
      status: "REJECTED",
      responseStatus: 403,
      responseBody: {
        error: "Deposit required to bid",
      },
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Deposit required to bid");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when bid request is already in progress", async () => {
    const requestHash = await makeRequestHash({
      auctionId,
      amount: validBody.amount,
      companyId,
      userId: buyerId,
    });

    mockPrisma.bidRequest.findUnique.mockResolvedValue({
      id: "req-3",
      requestHash,
      status: "IN_PROGRESS",
      responseStatus: null,
      responseBody: null,
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already in progress");
  });

  it("returns 409 when idempotency key was reused for a different bid", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue({
      id: "req-4",
      requestHash: "different-hash",
      status: "IN_PROGRESS",
      responseStatus: null,
      responseBody: null,
    });

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("different bid");
  });

  it("returns 201 and serializes bid data for a valid bid", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-5" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([makeLiveAuctionRow()]);
    mockTx.depositLock.findFirst.mockResolvedValue({ id: "lock-1" });
    mockTx.bid.create.mockResolvedValue(makeBidRecord());
    mockTx.$executeRaw.mockResolvedValueOnce(1);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.bid.amount).toBe(51_000);
    expect(res.body.bid.sequenceNo).toBe(6);
    expect(res.body.bid.createdAt).toBe("2026-03-14T09:00:00.000Z");
  });

  it("runs anti-sniping extension when less than three minutes remain", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-6" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([
      makeLiveAuctionRow({
        ends_at: new Date(Date.now() + 60_000),
      }),
    ]);
    mockTx.depositLock.findFirst.mockResolvedValue({ id: "lock-1" });
    mockTx.bid.create.mockResolvedValue(makeBidRecord());
    mockTx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("returns 409 when auction is not active", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-7" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([makeLiveAuctionRow({ state: "CLOSED" })]);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Auction is not active");
  });

  it("returns 409 when auction has already ended", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-8" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([
      makeLiveAuctionRow({
        ends_at: new Date(Date.now() - 60_000),
      }),
    ]);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Auction has ended");
  });

  it("returns 422 when bid amount is not higher than current price", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-9" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([makeLiveAuctionRow({ current_price: 51_000 })]);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Bid must be higher than current price");
  });

  it("returns 422 when bid does not meet minimum increment", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-10" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([
      makeLiveAuctionRow({
        current_price: 50_000,
        min_increment: 1_000,
      }),
    ]);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ ...validBody, amount: 50_500 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Bid must meet the minimum increment");
  });

  it("returns 403 when no active deposit lock exists", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-11" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([makeLiveAuctionRow()]);
    mockTx.depositLock.findFirst.mockResolvedValue(null);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Deposit required to bid");
  });

  it("returns 409 when locked auction row is missing", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-12" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([]);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Auction is not active");
  });

  it("returns 500 when optimistic lock update affects zero rows", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-13" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([makeLiveAuctionRow()]);
    mockTx.depositLock.findFirst.mockResolvedValue({ id: "lock-1" });
    mockTx.bid.create.mockResolvedValue(makeBidRecord());
    mockTx.$executeRaw.mockResolvedValueOnce(0);

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
  });

  it("marks BidRequest as SUCCEEDED after a successful bid", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-14" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([makeLiveAuctionRow()]);
    mockTx.depositLock.findFirst.mockResolvedValue({ id: "lock-1" });
    mockTx.bid.create.mockResolvedValue(makeBidRecord());
    mockTx.$executeRaw.mockResolvedValueOnce(1);

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
        }),
      }),
    );
  });

  it("marks BidRequest as REJECTED for business rule failures", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-15" });
    mockPrisma.bidRequest.update.mockResolvedValue({});

    setupTransactionSuccess();
    mockTx.$queryRaw.mockResolvedValue([makeLiveAuctionRow({ state: "CLOSED" })]);

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
          responseStatus: 409,
        }),
      }),
    );
  });

  it("marks BidRequest as FAILED for unexpected transaction errors", async () => {
    mockPrisma.bidRequest.findUnique.mockResolvedValue(null);
    mockPrisma.bidRequest.create.mockResolvedValue({ id: "req-16" });
    mockPrisma.bidRequest.update.mockResolvedValue({});
    mockPrisma.$transaction.mockRejectedValue(new Error("database is down"));

    const res = await request
      .post("/api/bids")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send(validBody);

    expect(res.status).toBe(500);
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

  it("does not require auth token", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(makeAuctionDetails());

    const res = await request.get(`/api/auctions/${auctionId}`);

    expect(res.status).toBe(200);
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
