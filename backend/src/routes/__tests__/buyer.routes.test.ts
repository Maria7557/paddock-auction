import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    bid: {
      findMany: vi.fn(),
    },
    savedLot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    wallet: {
      findUnique: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    auction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    vipUpgradeRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));

import { buildServer } from "../../server";

const jwtSecret = "test-secret-32-chars-long-enough!!";
const buyerUserId = randomUUID();
const buyerCompanyId = randomUUID();

async function makeToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
  kycVerified?: boolean;
}): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);

  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
    kycVerified: payload.kycVerified,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

let server: FastifyInstance;
let request: ReturnType<typeof supertest>;
let buyerToken: string;
let sellerToken: string;

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "test";

  server = await buildServer();
  await server.ready();
  request = supertest(server.server);

  buyerToken = await makeToken({
    userId: buyerUserId,
    role: "BUYER",
    companyId: buyerCompanyId,
    kycVerified: true,
  });
  sellerToken = await makeToken({
    userId: randomUUID(),
    role: "SELLER",
    companyId: randomUUID(),
  });
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.user.findUnique.mockResolvedValue({
    id: buyerUserId,
    role: "BUYER",
    status: "ACTIVE",
    kycVerified: true,
    companyUsers: [
      {
        companyId: buyerCompanyId,
        company: {
          status: "ACTIVE",
        },
      },
    ],
  });
  mockPrisma.bid.findMany.mockResolvedValue([]);
  mockPrisma.savedLot.findMany.mockResolvedValue([]);
  mockPrisma.savedLot.findFirst.mockResolvedValue(null);
  mockPrisma.wallet.findUnique.mockResolvedValue({
    balance: 5000,
    lockedBalance: 0,
  });
  mockPrisma.invoice.count.mockResolvedValue(0);
  mockPrisma.invoice.findMany.mockResolvedValue([]);
  mockPrisma.auction.findMany.mockResolvedValue([]);
  mockPrisma.auction.findUnique.mockResolvedValue(null);
  mockPrisma.company.findMany.mockResolvedValue([]);
  mockPrisma.company.findUnique.mockResolvedValue({
    buyerTier: "STANDARD",
  });
  mockPrisma.vipUpgradeRequest.findFirst.mockResolvedValue(null);
  mockPrisma.vipUpgradeRequest.create.mockResolvedValue({
    id: "vip-req-1",
    companyId: buyerCompanyId,
    status: "PENDING",
    requestedAt: new Date("2026-03-17T08:00:00.000Z"),
  });
});

describe("buyer auth guard", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.get("/api/buyer/dashboard");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 for non-buyer token", async () => {
    const res = await request
      .get("/api/buyer/dashboard")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });
});

describe("GET /api/buyer/dashboard", () => {
  it("returns metrics, onboarding state, and recommended lots", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "auction-1",
        state: "LIVE",
        currentPrice: 210000,
        minIncrement: 500,
        startingPrice: 200000,
        buyNowPrice: 240000,
        startsAt: new Date("2026-03-17T08:00:00.000Z"),
        endsAt: new Date("2026-03-18T08:00:00.000Z"),
        createdAt: new Date("2026-03-15T08:00:00.000Z"),
        sellerCompanyId: "seller-company-1",
        vehicle: {
          id: "vehicle-1",
          brand: "BMW",
          model: "M4",
          year: 2024,
          mileage: 46000,
          marketPrice: 420000,
          fuelType: "Petrol",
          transmission: "Automatic",
          bodyType: "Convertible",
          regionSpec: "USA",
          condition: "Good",
          images: ["/uploads/bmw.jpg"],
        },
        _count: {
          bids: 4,
        },
      },
    ]);
    mockPrisma.company.findMany.mockResolvedValue([
      {
        id: "seller-company-1",
        name: "Fleet Seller",
        country: "Dubai",
      },
    ]);

    const res = await request
      .get("/api/buyer/dashboard")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({
      activeBids: 0,
      watching: 0,
      watchlistCount: 0,
      invoicesDue: 0,
      depositBalance: 5000,
      depositLocked: 0,
      depositBalanceAed: 5000,
    });
    expect(res.body.depositStatus.hasRequiredDeposit).toBe(true);
    expect(res.body.onboardingStep).toBe(3);
    expect(res.body.recommendedLots).toHaveLength(1);
    expect(res.body.recommendedLots[0]).toEqual({
      id: "auction-1",
      title: "BMW M4",
      currentBid: 210000,
      status: "LIVE",
      year: 2024,
      mileage: 46000,
      regionSpec: "USA",
      marketPrice: 420000,
      buyNowPrice: 240000,
      imageUrl: "/uploads/bmw.jpg",
      startsAt: "2026-03-17T08:00:00.000Z",
      endsAt: "2026-03-18T08:00:00.000Z",
    });
    expect(res.body.vipStatus).toEqual({
      tier: "STANDARD",
      upgradeRequest: null,
    });
  });

  it("returns onboarding step 1 when buyer is not verified", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: buyerUserId,
      role: "BUYER",
      status: "PENDING_APPROVAL",
      kycVerified: false,
      companyUsers: [
        {
          companyId: buyerCompanyId,
          company: {
            status: "PENDING_APPROVAL",
          },
        },
      ],
    });

    const res = await request
      .get("/api/buyer/dashboard")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.onboardingStep).toBe(1);
  });
});

describe("GET /api/buyer/watchlist", () => {
  it("returns paginated watchlisted lots with filters", async () => {
    mockPrisma.savedLot.findMany.mockResolvedValue([
      {
        id: "saved-1",
        auctionId: "auction-1",
        createdAt: new Date("2026-03-17T08:00:00.000Z"),
        auction: {
          id: "auction-1",
          state: "SCHEDULED",
          currentPrice: 240000,
          minIncrement: 500,
          startingPrice: 220000,
          buyNowPrice: 260000,
          startsAt: new Date("2026-03-20T08:00:00.000Z"),
          endsAt: new Date("2026-03-21T08:00:00.000Z"),
          createdAt: new Date("2026-03-16T08:00:00.000Z"),
          sellerCompanyId: "seller-company-1",
          vehicle: {
            id: "vehicle-1",
            brand: "Toyota",
            model: "Camry",
            year: 2024,
            mileage: 12000,
            marketPrice: 310000,
            fuelType: "Petrol",
            transmission: "Automatic",
            bodyType: "Sedan",
            regionSpec: "GCC",
            condition: "Excellent",
            images: ["/uploads/camry.jpg"],
          },
          _count: {
            bids: 2,
          },
        },
      },
      {
        id: "saved-2",
        auctionId: "auction-2",
        createdAt: new Date("2026-03-16T08:00:00.000Z"),
        auction: {
          id: "auction-2",
          state: "LIVE",
          currentPrice: 250000,
          minIncrement: 500,
          startingPrice: 230000,
          buyNowPrice: 290000,
          startsAt: new Date("2026-03-18T08:00:00.000Z"),
          endsAt: new Date("2026-03-19T08:00:00.000Z"),
          createdAt: new Date("2026-03-15T08:00:00.000Z"),
          sellerCompanyId: "seller-company-2",
          vehicle: {
            id: "vehicle-2",
            brand: "BMW",
            model: "M4",
            year: 2024,
            mileage: 46000,
            marketPrice: 420000,
            fuelType: "Petrol",
            transmission: "Automatic",
            bodyType: "Convertible",
            regionSpec: "USA",
            condition: "Good",
            images: ["/uploads/m4.jpg"],
          },
          _count: {
            bids: 4,
          },
        },
      },
    ]);
    mockPrisma.company.findMany.mockResolvedValue([
      {
        id: "seller-company-1",
        name: "Fleet Seller",
        country: "Dubai",
      },
      {
        id: "seller-company-2",
        name: "Premium Seller",
        country: "Abu Dhabi",
      },
    ]);

    const res = await request
      .get("/api/buyer/watchlist?status=SCHEDULED&limit=1")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(1);
    expect(res.body.lots[0].id).toBe("auction-1");
    expect(res.body.lots[0].isWatchlisted).toBe(true);
    expect(res.body.nextCursor).toBe(null);
  });
});

describe("GET /api/buyer/my-bids", () => {
  it("returns grouped buyer bids with status-specific actions", async () => {
    mockPrisma.bid.findMany.mockResolvedValue([
      {
        id: "bid-1",
        auctionId: "auction-1",
        amount: 171500,
        createdAt: new Date("2026-03-17T08:00:00.000Z"),
        auction: {
          id: "auction-1",
          state: "LIVE",
          highestBidId: "someone-else",
          currentPrice: 172000,
          winnerCompanyId: null,
          decisionDeadlineAt: null,
          startsAt: new Date("2026-03-18T08:00:00.000Z"),
          endsAt: new Date("2026-03-19T08:00:00.000Z"),
          vehicle: {
            brand: "BMW",
            model: "X5 M",
            images: ["https://cdn.example.com/bmw-x5m.jpg"],
          },
        },
      },
      {
        id: "bid-2",
        auctionId: "auction-2",
        amount: 240000,
        createdAt: new Date("2026-03-17T09:00:00.000Z"),
        auction: {
          id: "auction-2",
          state: "SCHEDULED",
          highestBidId: "bid-2",
          currentPrice: 240000,
          winnerCompanyId: null,
          decisionDeadlineAt: null,
          startsAt: new Date("2026-03-18T08:00:00.000Z"),
          endsAt: new Date("2026-03-20T08:00:00.000Z"),
          vehicle: {
            brand: "Toyota",
            model: "Camry",
            images: [],
          },
        },
      },
      {
        id: "bid-3",
        auctionId: "auction-3",
        amount: 310000,
        createdAt: new Date("2026-03-17T10:00:00.000Z"),
        auction: {
          id: "auction-3",
          state: "AWAITING_SELLER_DECISION",
          highestBidId: "bid-3",
          currentPrice: 310000,
          winnerCompanyId: buyerCompanyId,
          decisionDeadlineAt: new Date("2026-03-20T08:00:00.000Z"),
          startsAt: new Date("2026-03-16T08:00:00.000Z"),
          endsAt: new Date("2026-03-17T08:00:00.000Z"),
          vehicle: {
            brand: "Audi",
            model: "A6",
            images: ["https://cdn.example.com/audi-a6.jpg"],
          },
        },
      },
      {
        id: "bid-4",
        auctionId: "auction-4",
        amount: 420000,
        createdAt: new Date("2026-03-17T11:00:00.000Z"),
        auction: {
          id: "auction-4",
          state: "PAID",
          highestBidId: "bid-4",
          currentPrice: 420000,
          winnerCompanyId: buyerCompanyId,
          decisionDeadlineAt: null,
          startsAt: new Date("2026-03-15T08:00:00.000Z"),
          endsAt: new Date("2026-03-16T08:00:00.000Z"),
          vehicle: {
            brand: "Mercedes-Benz",
            model: "C-Class",
            images: ["https://cdn.example.com/mercedes-c-class.jpg"],
          },
        },
      },
      {
        id: "bid-5",
        auctionId: "auction-5",
        amount: 199000,
        createdAt: new Date("2026-03-17T12:00:00.000Z"),
        auction: {
          id: "auction-5",
          state: "CANCELED",
          highestBidId: "someone-else",
          currentPrice: 205000,
          winnerCompanyId: "other-company",
          decisionDeadlineAt: null,
          startsAt: new Date("2026-03-15T09:00:00.000Z"),
          endsAt: new Date("2026-03-16T09:00:00.000Z"),
          vehicle: {
            brand: "Nissan",
            model: "Patrol",
            images: ["https://cdn.example.com/nissan-patrol.jpg"],
          },
        },
      },
    ]);

    const res = await request
      .get("/api/buyer/my-bids")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.live).toEqual([
      {
        auctionId: "auction-1",
        lotTitle: "BMW X5 M",
        imageUrl: "https://cdn.example.com/bmw-x5m.jpg",
        myBidAmount: 171500,
        currentHighestBid: 172000,
        isLeading: false,
        auctionEndIso: "2026-03-19T08:00:00.000Z",
        auctionStatus: "LIVE",
      },
    ]);
    expect(res.body.scheduled).toEqual([
      {
        auctionId: "auction-2",
        lotTitle: "Toyota Camry",
        imageUrl: null,
        myBidAmount: 240000,
        auctionStartIso: "2026-03-18T08:00:00.000Z",
        auctionStatus: "SCHEDULED",
        isLeading: true,
      },
    ]);
    expect(res.body.wonPending).toEqual([
      {
        auctionId: "auction-3",
        lotTitle: "Audi A6",
        imageUrl: "https://cdn.example.com/audi-a6.jpg",
        myBidAmount: 310000,
        auctionStatus: "AWAITING_SELLER_DECISION",
        sellerDecisionDeadlineIso: "2026-03-20T08:00:00.000Z",
      },
    ]);
    expect(res.body.ended).toEqual([
      {
        auctionId: "auction-4",
        lotTitle: "Mercedes-Benz C-Class",
        imageUrl: "https://cdn.example.com/mercedes-c-class.jpg",
        myBidAmount: 420000,
        auctionStatus: "PAID",
        isLeading: true,
      },
    ]);
    expect(res.body.ended.find((item: { auctionId: string }) => item.auctionId === "auction-5")).toBeUndefined();
    expect(res.body.live[0]).toMatchObject({
      auctionId: "auction-1",
      isLeading: false,
    });
  });
});

describe("POST /api/buyer/watchlist/:lotId", () => {
  it("adds a lot to watchlist when missing", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue({
      id: "auction-1",
    });

    const res = await request
      .post("/api/buyer/watchlist/auction-1")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.watchlisted).toBe(true);
    expect(mockPrisma.savedLot.create).toHaveBeenCalled();
  });

  it("removes a lot from watchlist when present", async () => {
    mockPrisma.savedLot.findFirst.mockResolvedValue({
      id: "saved-1",
    });

    const res = await request
      .post("/api/buyer/watchlist/auction-1")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.watchlisted).toBe(false);
    expect(mockPrisma.savedLot.delete).toHaveBeenCalledWith({
      where: {
        id: "saved-1",
      },
    });
  });
});

describe("POST /api/buyer/vip-request", () => {
  it("returns the existing pending request instead of creating a duplicate", async () => {
    mockPrisma.vipUpgradeRequest.findFirst.mockResolvedValue({
      id: "vip-request-existing",
      companyId: buyerCompanyId,
      status: "PENDING",
      requestedAt: new Date("2026-03-17T08:00:00.000Z"),
    });

    const res = await request
      .post("/api/buyer/vip-request")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      requestId: "vip-request-existing",
      status: "PENDING",
    });
    expect(mockPrisma.vipUpgradeRequest.create).not.toHaveBeenCalled();
  });

  it("creates a pending VIP request when none exists", async () => {
    const res = await request
      .post("/api/buyer/vip-request")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      requestId: "vip-req-1",
      status: "PENDING",
    });
  });
});

describe("GET /api/buyer/vip-status", () => {
  it("returns company tier and latest upgrade request", async () => {
    mockPrisma.company.findUnique.mockResolvedValue({
      buyerTier: "VIP",
    });
    mockPrisma.vipUpgradeRequest.findFirst.mockResolvedValue({
      status: "APPROVED",
      requestedAt: new Date("2026-03-17T08:00:00.000Z"),
    });

    const res = await request
      .get("/api/buyer/vip-status")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      tier: "VIP",
      upgradeRequest: {
        status: "APPROVED",
        requestedAt: "2026-03-17T08:00:00.000Z",
      },
    });
  });
});
