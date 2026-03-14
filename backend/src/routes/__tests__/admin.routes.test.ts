import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    vehicle: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    auction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    wallet: {
      findUnique: vi.fn(),
    },
    depositLock: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));

import { buildServer } from "../../server";

const jwtSecret = "test-secret-32-chars-long-enough!!";
const adminUserId = randomUUID();

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

function buildAdminTx(overrides: Record<string, unknown> = {}) {
  return {
    auction: {
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    auctionStateTransition: {
      create: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    wallet: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    walletLedger: {
      create: vi.fn(),
    },
    depositLock: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    ...overrides,
  };
}

let server: FastifyInstance;
let request: ReturnType<typeof supertest>;
let adminToken: string;
let sellerToken: string;
let buyerToken: string;

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "test";
  server = await buildServer();
  await server.ready();
  request = supertest(server.server);

  adminToken = await makeToken({
    userId: adminUserId,
    role: "ADMIN",
  });
  sellerToken = await makeToken({
    userId: randomUUID(),
    role: "SELLER",
    companyId: randomUUID(),
  });
  buyerToken = await makeToken({
    userId: randomUUID(),
    role: "BUYER",
    companyId: randomUUID(),
  });
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin auth guard", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.get("/api/admin/companies/pending");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 for SELLER token", async () => {
    const res = await request
      .get("/api/admin/companies/pending")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 for BUYER token", async () => {
    const res = await request
      .get("/api/admin/companies/pending")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(401);
  });

  it("allows ADMIN token through", async () => {
    mockPrisma.company.findMany.mockResolvedValue([]);

    const res = await request
      .get("/api/admin/companies/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.companies).toEqual([]);
  });
});

describe("GET /api/admin/companies/pending", () => {
  it("returns 200 with pending companies list", async () => {
    mockPrisma.company.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Fleet Corp",
        status: "PENDING_APPROVAL",
        createdAt: new Date("2026-03-14T08:00:00.000Z"),
        users: [
          {
            id: "cu1",
            role: "SELLER_MANAGER",
            user: {
              id: "u1",
              email: "seller@example.com",
              status: "PENDING_APPROVAL",
            },
          },
        ],
      },
    ]);

    const res = await request
      .get("/api/admin/companies/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].name).toBe("Fleet Corp");
  });

  it("returns empty array when no pending companies", async () => {
    mockPrisma.company.findMany.mockResolvedValue([]);

    const res = await request
      .get("/api/admin/companies/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      companies: [],
    });
  });
});

describe("POST /api/admin/companies/:id/approve", () => {
  it("returns 200 when company is approved", async () => {
    const tx = buildAdminTx();
    tx.company.findUnique.mockResolvedValue({
      id: "c1",
      users: [{ userId: "u1" }],
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/companies/c1/approve")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 404 when company is not found", async () => {
    const tx = buildAdminTx();
    tx.company.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/companies/missing/approve")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("COMPANY_NOT_FOUND");
  });
});

describe("POST /api/admin/companies/:id/reject", () => {
  it("returns 200 when company is rejected", async () => {
    const tx = buildAdminTx();
    tx.company.findUnique.mockResolvedValue({
      id: "c1",
      users: [{ userId: "u1" }],
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/companies/c1/reject")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /api/admin/vehicles", () => {
  it("returns 200 with vehicles list", async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([
      {
        id: "v1",
        brand: "BMW",
        model: "X5",
        year: 2023,
        vin: "VIN001",
        marketPrice: 200000,
        media: [{ url: "https://example.com/bmw.jpg" }],
        images: [],
        auctions: [{ id: "a1", state: "SCHEDULED" }],
      },
    ]);

    const res = await request
      .get("/api/admin/vehicles")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.vehicles).toHaveLength(1);
    expect(res.body.vehicles[0].status).toBe("APPROVED");
  });

  it("filters by status=PENDING", async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([
      {
        id: "v1",
        brand: "BMW",
        model: "X5",
        year: 2023,
        vin: "VIN001",
        marketPrice: 200000,
        media: [],
        images: [],
        auctions: [{ id: "a1", state: "SCHEDULED" }],
      },
      {
        id: "v2",
        brand: "Audi",
        model: "Q8",
        year: 2024,
        vin: "VIN002",
        marketPrice: 250000,
        media: [],
        images: [],
        auctions: [{ id: "a2", state: "DRAFT" }],
      },
    ]);

    const res = await request
      .get("/api/admin/vehicles?status=PENDING")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.vehicles).toHaveLength(1);
    expect(res.body.vehicles[0].id).toBe("v2");
  });
});

describe("POST /api/admin/vehicles/:id/approve", () => {
  it("returns 200 when vehicle is approved", async () => {
    mockPrisma.vehicle.findUnique.mockResolvedValue({
      id: "v1",
      auctions: [{ id: "a1", state: "DRAFT" }],
    });

    const tx = buildAdminTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/vehicles/v1/approve")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 when vehicle is not found", async () => {
    mockPrisma.vehicle.findUnique.mockResolvedValue(null);

    const res = await request
      .post("/api/admin/vehicles/missing/approve")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VEHICLE_NOT_FOUND");
  });
});

describe("POST /api/admin/vehicles/:id/reject", () => {
  it("returns 200 when vehicle is rejected", async () => {
    mockPrisma.vehicle.findUnique.mockResolvedValue({
      id: "v1",
      auctions: [{ id: "a1", state: "DRAFT" }],
    });

    const tx = buildAdminTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/vehicles/v1/reject")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /api/admin/users/pending", () => {
  it("returns 200 with users list", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        email: "buyer@example.com",
        role: "BUYER",
        status: "PENDING_APPROVAL",
        kycVerified: false,
        createdAt: new Date("2026-03-14T08:00:00.000Z"),
        wallet: {
          balance: 10000,
        },
        companyUsers: [
          {
            id: "cu1",
            role: "BUYER_BIDDER",
            company: {
              id: "c1",
              name: "Buyer Co",
              status: "ACTIVE",
            },
          },
        ],
      },
    ]);

    const res = await request
      .get("/api/admin/users/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].email).toBe("buyer@example.com");
  });
});

describe("POST /api/admin/users/:id/approve-kyc", () => {
  it("returns 200 when KYC is approved", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "BUYER",
    });

    const tx = buildAdminTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/users/u1/approve-kyc")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: "u1",
      kycVerified: true,
    });
  });

  it("returns 404 when user is not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request
      .post("/api/admin/users/missing/approve-kyc")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("USER_NOT_FOUND");
  });
});

describe("POST /api/admin/users/:id/block", () => {
  it("returns 200 when user is blocked", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
    });

    const tx = buildAdminTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/users/u1/block")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "Policy violation",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("BLOCKED");
  });
});

describe("POST /api/admin/users/:id/unblock", () => {
  it("returns 200 when user is unblocked", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "BLOCKED",
    });

    const tx = buildAdminTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/users/u1/unblock")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "Issue resolved",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
  });
});

describe("POST /api/admin/events", () => {
  it("returns 201 when event is created", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue({
      vehicleId: "v1",
      sellerCompanyId: "seller-company",
      minIncrement: 500,
    });

    const tx = buildAdminTx();
    tx.auction.create.mockResolvedValue({
      id: "ev1",
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Evening Event",
        date: "2026-03-15",
        startTime: "18:00",
        description: "Prime lots",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: "ev1",
      success: true,
    });
  });
});

describe("GET /api/admin/events/:id", () => {
  it("returns 200 with event data", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue({
      id: "ev1",
      state: "DRAFT",
      startsAt: new Date("2026-03-15T14:00:00.000Z"),
      endsAt: new Date("2026-03-15T16:00:00.000Z"),
      transitions: [
        {
          trigger: "EVENT_META",
          reason: JSON.stringify({
            title: "Evening Event",
            description: "Prime lots",
          }),
        },
        {
          trigger: "EVENT_ORDER",
          reason: JSON.stringify({
            vehicleIds: ["v1"],
          }),
        },
      ],
    });
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "a1",
        vehicleId: "v1",
        createdAt: new Date("2026-03-15T14:05:00.000Z"),
        vehicle: {
          id: "v1",
          brand: "BMW",
          model: "X5",
          year: 2023,
          vin: "VIN001",
          marketPrice: 200000,
          images: ["https://example.com/bmw.jpg"],
        },
      },
    ]);

    const res = await request
      .get("/api/admin/events/ev1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("ev1");
    expect(res.body.title).toBe("Evening Event");
    expect(res.body.lots).toHaveLength(1);
  });

  it("returns 404 when event is not found", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(null);

    const res = await request
      .get("/api/admin/events/missing")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("EVENT_NOT_FOUND");
  });
});

describe("GET /api/admin/deposits/pending-returns", () => {
  it("returns 200 with pending returns list", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        ledgerId: "l1",
        walletId: "w1",
        userId: "u1",
        email: "buyer@example.com",
        amount: 2500,
        reference: "withdraw-1",
        createdAt: new Date("2026-03-14T08:00:00.000Z"),
      },
    ]);

    const res = await request
      .get("/api/admin/deposits/pending-returns")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.returns).toHaveLength(1);
    expect(res.body.returns[0].amount).toBe(2500);
  });
});

describe("POST /api/admin/deposits/:userId/approve-return", () => {
  it("returns 200 when deposit return is approved", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "BUYER",
    });
    mockPrisma.wallet.findUnique.mockResolvedValue({
      id: "w1",
    });
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        id: "req1",
        amount: -3000,
        reference: "withdraw-req-1",
      },
    ]);

    const tx = buildAdminTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/deposits/u1/approve-return")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
  });
});

describe("POST /api/admin/deposits/:userId/burn", () => {
  it("returns 200 when deposit is burned", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "BUYER",
    });
    mockPrisma.wallet.findUnique.mockResolvedValue({
      id: "w1",
    });
    mockPrisma.depositLock.findFirst.mockResolvedValue({
      id: "dl1",
      amount: 5000,
    });

    const tx = buildAdminTx();
    tx.wallet.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/deposits/u1/burn")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "Buyer defaulted after payment deadline",
        auctionId: "a1",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: "u1",
      auctionId: "a1",
      burnedAmount: 5000,
      reason: "Buyer defaulted after payment deadline",
    });
  });
});
