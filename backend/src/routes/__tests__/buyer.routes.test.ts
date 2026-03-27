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
      findFirst: vi.fn(),
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
    $queryRaw: vi.fn(),
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
  mockPrisma.$queryRaw.mockResolvedValue([
    {
      currentTime: new Date("2026-03-19T12:00:00.000Z"),
    },
  ]);

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
          buyerTier: "STANDARD",
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
  mockPrisma.invoice.findFirst.mockResolvedValue(null);
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

  it("hides restricted bid, watchlist, and recommendation data from regular buyers", async () => {
    const approvedAt = new Date("2026-03-19T11:00:00.000Z");
    const releaseAt = new Date("2026-03-20T11:00:00.000Z");

    mockPrisma.bid.findMany
      .mockResolvedValueOnce([
        {
          auctionId: "auction-hidden",
          auction: {
            sellerCompanyId: "seller-company-hidden",
            approvedAt,
            vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
            vipReleaseAt: releaseAt,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "bid-hidden",
          auctionId: "auction-hidden",
          amount: 171500,
          createdAt: new Date("2026-03-19T11:30:00.000Z"),
          auction: {
            id: "auction-hidden",
            state: "LIVE",
            highestBidId: "someone-else",
            currentPrice: 172000,
            sellerCompanyId: "seller-company-hidden",
            approvedAt,
            vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
            vipReleaseAt: releaseAt,
            vehicle: {
              brand: "BMW",
              model: "X5 M",
            },
          },
        },
      ]);
    mockPrisma.savedLot.findMany.mockResolvedValue([
      {
        id: "saved-hidden",
        auctionId: "auction-hidden",
        createdAt: new Date("2026-03-19T11:10:00.000Z"),
        auction: {
          id: "auction-hidden",
          sellerCompanyId: "seller-company-hidden",
          approvedAt,
          vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
          vipReleaseAt: releaseAt,
          vehicle: {
            brand: "BMW",
            model: "X5 M",
          },
        },
      },
    ]);
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "auction-hidden",
        state: "LIVE",
        currentPrice: 210000,
        minIncrement: 500,
        startingPrice: 200000,
        buyNowPrice: 240000,
        startsAt: new Date("2026-03-19T10:00:00.000Z"),
        endsAt: new Date("2026-03-20T10:00:00.000Z"),
        createdAt: new Date("2026-03-18T08:00:00.000Z"),
        sellerCompanyId: "seller-company-hidden",
        approvedAt,
        vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
        vipReleaseAt: releaseAt,
        vehicle: {
          id: "vehicle-hidden",
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

    const res = await request
      .get("/api/buyer/dashboard")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics.activeBids).toBe(0);
    expect(res.body.metrics.watching).toBe(0);
    expect(res.body.metrics.watchlistCount).toBe(0);
    expect(res.body.recentActivity).toEqual([]);
    expect(res.body.recommendedLots).toEqual([]);
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

  it("filters restricted lots out of the watchlist for regular buyers", async () => {
    mockPrisma.savedLot.findMany.mockResolvedValue([
      {
        id: "saved-hidden",
        auctionId: "auction-hidden",
        createdAt: new Date("2026-03-17T08:00:00.000Z"),
        auction: {
          id: "auction-hidden",
          state: "SCHEDULED",
          currentPrice: 240000,
          minIncrement: 500,
          startingPrice: 220000,
          buyNowPrice: 260000,
          startsAt: new Date("2026-03-20T08:00:00.000Z"),
          endsAt: new Date("2026-03-21T08:00:00.000Z"),
          createdAt: new Date("2026-03-16T08:00:00.000Z"),
          sellerCompanyId: "seller-company-1",
          approvedAt: new Date("2026-03-19T11:00:00.000Z"),
          vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
          vipReleaseAt: new Date("2026-03-20T11:00:00.000Z"),
          vehicle: {
            id: "vehicle-hidden",
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
        id: "saved-visible",
        auctionId: "auction-visible",
        createdAt: new Date("2026-03-17T09:00:00.000Z"),
        auction: {
          id: "auction-visible",
          state: "LIVE",
          currentPrice: 250000,
          minIncrement: 500,
          startingPrice: 230000,
          buyNowPrice: 290000,
          startsAt: new Date("2026-03-18T08:00:00.000Z"),
          endsAt: new Date("2026-03-19T20:00:00.000Z"),
          createdAt: new Date("2026-03-15T08:00:00.000Z"),
          sellerCompanyId: "seller-company-2",
          approvedAt: null,
          vipAccessPolicy: null,
          vipReleaseAt: null,
          vehicle: {
            id: "vehicle-visible",
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
        id: "seller-company-2",
        name: "Premium Seller",
        country: "Abu Dhabi",
      },
    ]);

    const res = await request
      .get("/api/buyer/watchlist")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(1);
    expect(res.body.lots[0].id).toBe("auction-visible");
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
          invoice: null,
        },
      },
      {
        id: "bid-4",
        auctionId: "auction-4",
        amount: 420000,
        createdAt: new Date("2026-03-17T11:00:00.000Z"),
        auction: {
          id: "auction-4",
          state: "PAYMENT_PENDING",
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
          invoice: {
            id: "invoice-4",
            dueAt: new Date("2026-03-19T08:00:00.000Z"),
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
          invoice: null,
        },
      },
      {
        id: "bid-6",
        auctionId: "auction-6",
        amount: 455000,
        createdAt: new Date("2026-03-17T13:00:00.000Z"),
        auction: {
          id: "auction-6",
          state: "RELISTED",
          highestBidId: "bid-6",
          currentPrice: 455000,
          winnerCompanyId: buyerCompanyId,
          decisionDeadlineAt: null,
          startsAt: new Date("2026-03-14T08:00:00.000Z"),
          endsAt: new Date("2026-03-15T08:00:00.000Z"),
          vehicle: {
            brand: "Porsche",
            model: "Cayenne",
            images: ["https://cdn.example.com/porsche-cayenne.jpg"],
          },
          invoice: {
            id: "invoice-6",
            dueAt: new Date("2026-03-18T08:00:00.000Z"),
          },
        },
      },
      {
        id: "bid-7",
        auctionId: "auction-7",
        amount: 287000,
        createdAt: new Date("2026-03-17T14:00:00.000Z"),
        auction: {
          id: "auction-7",
          state: "DEFAULTED",
          highestBidId: "bid-7",
          currentPrice: 287000,
          winnerCompanyId: buyerCompanyId,
          decisionDeadlineAt: null,
          startsAt: new Date("2026-03-13T08:00:00.000Z"),
          endsAt: new Date("2026-03-14T08:00:00.000Z"),
          vehicle: {
            brand: "Lexus",
            model: "ES",
            images: ["https://cdn.example.com/lexus-es.jpg"],
          },
          invoice: null,
        },
      },
    ]);
    mockPrisma.invoice.findFirst.mockResolvedValueOnce({
      id: "invoice-4",
      dueAt: new Date("2026-03-19T08:00:00.000Z"),
    });

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
    expect(res.body.wonInvoice).toEqual([
      {
        auctionId: "auction-4",
        lotTitle: "Mercedes-Benz C-Class",
        imageUrl: "https://cdn.example.com/mercedes-c-class.jpg",
        myBidAmount: 420000,
        auctionStatus: "PAYMENT_PENDING",
        invoiceId: "invoice-4",
        invoiceDueAt: "2026-03-19T08:00:00.000Z",
      },
    ]);
    expect(res.body.ended).toEqual([
      {
        auctionId: "auction-6",
        lotTitle: "Porsche Cayenne",
        imageUrl: "https://cdn.example.com/porsche-cayenne.jpg",
        myBidAmount: 455000,
        auctionStatus: "RELISTED",
        isLeading: true,
      },
      {
        auctionId: "auction-7",
        lotTitle: "Lexus ES",
        imageUrl: "https://cdn.example.com/lexus-es.jpg",
        myBidAmount: 287000,
        auctionStatus: "DEFAULTED",
        isLeading: true,
      },
    ]);
    expect(res.body.ended.find((item: { auctionId: string }) => item.auctionId === "auction-4")).toBeUndefined();
    expect(res.body.ended.find((item: { auctionId: string }) => item.auctionId === "auction-5")).toBeUndefined();
    expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith({
      where: {
        auctionId: "auction-4",
        buyerCompanyId,
      },
      select: {
        id: true,
        dueAt: true,
      },
    });
    expect(res.body.live[0]).toMatchObject({
      auctionId: "auction-1",
      isLeading: false,
    });
  });

  it("hides restricted lots from my bids for regular buyers", async () => {
    mockPrisma.bid.findMany.mockResolvedValue([
      {
        id: "bid-hidden",
        auctionId: "auction-hidden",
        amount: 171500,
        createdAt: new Date("2026-03-17T08:00:00.000Z"),
        auction: {
          id: "auction-hidden",
          state: "LIVE",
          highestBidId: "someone-else",
          currentPrice: 172000,
          sellerCompanyId: "seller-company-hidden",
          approvedAt: new Date("2026-03-19T11:00:00.000Z"),
          vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
          vipReleaseAt: new Date("2026-03-20T11:00:00.000Z"),
          startsAt: new Date("2026-03-18T08:00:00.000Z"),
          endsAt: new Date("2026-03-19T18:00:00.000Z"),
          vehicle: {
            brand: "BMW",
            model: "X5 M",
          },
        },
      },
      {
        id: "bid-visible",
        auctionId: "auction-visible",
        amount: 240000,
        createdAt: new Date("2026-03-17T09:00:00.000Z"),
        auction: {
          id: "auction-visible",
          state: "LIVE",
          highestBidId: "bid-visible",
          currentPrice: 240000,
          sellerCompanyId: "seller-company-visible",
          approvedAt: null,
          vipAccessPolicy: null,
          vipReleaseAt: null,
          startsAt: new Date("2026-03-18T08:00:00.000Z"),
          endsAt: new Date("2026-03-20T08:00:00.000Z"),
          vehicle: {
            brand: "Toyota",
            model: "Camry",
          },
        },
      },
    ]);
    mockPrisma.company.findMany.mockResolvedValue([
      { id: "seller-company-visible", name: "Seller Visible", country: "Abu Dhabi" },
    ]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const res = await request
      .get("/api/buyer/my-bids")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      auctionId: "auction-visible",
      status: "WINNING",
    });
  });
});

describe("POST /api/buyer/watchlist/:lotId", () => {
  it("adds a lot to watchlist when missing", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue({
      id: "auction-1",
      sellerCompanyId: "seller-company-1",
      approvedAt: null,
      vipAccessPolicy: null,
      vipReleaseAt: null,
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

  it("returns LOT_UNAVAILABLE when adding a restricted lot during VIP early access", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue({
      id: "auction-1",
      sellerCompanyId: "seller-company-1",
      approvedAt: new Date("2026-03-19T11:00:00.000Z"),
      vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
      vipReleaseAt: new Date("2026-03-20T11:00:00.000Z"),
    });

    const res = await request
      .post("/api/buyer/watchlist/auction-1")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("LOT_UNAVAILABLE");
    expect(mockPrisma.savedLot.create).not.toHaveBeenCalled();
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
