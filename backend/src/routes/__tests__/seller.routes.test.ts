import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    vehicle: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    auction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    bid: {
      findMany: vi.fn(),
    },
    idempotencyKey: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

const { mockDepositCommands } = vi.hoisted(() => ({
  mockDepositCommands: {
    releaseAuctionBidsFromBuyingPower: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));
vi.mock("../../modules/deposits/application/deposit_commands", () => ({
  releaseAuctionBidsFromBuyingPower: mockDepositCommands.releaseAuctionBidsFromBuyingPower,
}));

import { buildServer } from "../../server";

const jwtSecret = "test-secret-32-chars-long-enough!!";
const sellerUserId = randomUUID();
const sellerCompanyId = randomUUID();

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

function buildSellerTx(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn(),
    vehicle: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auction: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
    },
    invoice: {
      create: vi.fn(),
    },
    paymentDeadline: {
      create: vi.fn(),
    },
    depositLock: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    wallet: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    walletLedger: {
      create: vi.fn(),
    },
    auctionStateTransition: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    ...overrides,
  };
}

let server: FastifyInstance;
let request: ReturnType<typeof supertest>;
let sellerToken: string;
let buyerToken: string;
let adminToken: string;
let sellerTokenWithoutCompany: string;

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "test";
  server = await buildServer();
  await server.ready();
  request = supertest(server.server);

  sellerToken = await makeToken({
    userId: sellerUserId,
    role: "SELLER",
    companyId: sellerCompanyId,
  });
  buyerToken = await makeToken({
    userId: randomUUID(),
    role: "BUYER",
    companyId: randomUUID(),
  });
  adminToken = await makeToken({
    userId: randomUUID(),
    role: "ADMIN",
  });
  sellerTokenWithoutCompany = await makeToken({
    userId: randomUUID(),
    role: "SELLER",
  });
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockDepositCommands.releaseAuctionBidsFromBuyingPower.mockResolvedValue(undefined);
  mockPrisma.idempotencyKey.findFirst.mockResolvedValue(null);
  mockPrisma.idempotencyKey.create.mockResolvedValue({
    id: "idem-1",
  });
  mockPrisma.idempotencyKey.updateMany.mockResolvedValue({
    count: 1,
  });
});

describe("seller auth guard", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.get("/api/seller/dashboard");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 for BUYER token", async () => {
    const res = await request
      .get("/api/seller/dashboard")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 for ADMIN token", async () => {
    const res = await request
      .get("/api/seller/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 for SELLER token without companyId", async () => {
    const res = await request
      .get("/api/seller/dashboard")
      .set("Authorization", `Bearer ${sellerTokenWithoutCompany}`);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/seller/dashboard", () => {
  it("returns dashboard metrics and recent auctions", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "a1",
        state: "LIVE",
        currentPrice: 1000,
        highestBidId: "b1",
        vehicleId: "v1",
        startsAt: new Date("2026-03-14T08:00:00.000Z"),
        endsAt: new Date("2026-03-14T10:00:00.000Z"),
      },
      {
        id: "a2",
        state: "PAID",
        currentPrice: 5000,
        highestBidId: "b2",
        vehicleId: "v2",
        startsAt: new Date("2026-03-13T08:00:00.000Z"),
        endsAt: new Date("2026-03-13T10:00:00.000Z"),
      },
      {
        id: "a3",
        state: "DRAFT",
        currentPrice: 0,
        highestBidId: null,
        vehicleId: "v1",
        startsAt: new Date("2026-03-15T08:00:00.000Z"),
        endsAt: new Date("2026-03-15T10:00:00.000Z"),
      },
    ]);

    const res = await request
      .get("/api/seller/dashboard")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({
      totalVehicles: 2,
      activeLots: 2,
      completedLots: 1,
      revenue: 5000,
    });
    expect(Array.isArray(res.body.auctions)).toBe(true);
    expect(res.body.auctions).toHaveLength(3);
  });
});

describe("seller decision flow", () => {
  it("returns pending seller decisions", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "auction-1",
        currentPrice: "125000.00",
        decisionDeadlineAt: new Date("2026-03-25T08:00:00.000Z"),
        winnerCompanyId: "abcd-buyer-company",
        vehicle: {
          brand: "Toyota",
          model: "Land Cruiser",
          images: ["https://img.example/lot-1.jpg"],
        },
      },
    ]);

    const res = await request
      .get("/api/seller/decisions/pending")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pending: [
        {
          auctionId: "auction-1",
          lotTitle: "Toyota Land Cruiser",
          imageUrl: "https://img.example/lot-1.jpg",
          winningBidAmount: 125000,
          buyerAlias: "Buyer #ABCD",
          decisionDeadlineIso: "2026-03-25T08:00:00.000Z",
          status: "AWAITING_SELLER_DECISION",
        },
      ],
    });
  });

  it("accepts a seller decision and issues an invoice", async () => {
    const tx = buildSellerTx({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "auction-1",
          state: "AWAITING_SELLER_DECISION",
          seller_company_id: sellerCompanyId,
          winner_company_id: "buyer-company-1",
          current_price: "120000.00",
          seller_decision: null,
        },
      ]),
      company: {
        findUnique: vi.fn().mockResolvedValue({
          buyerTier: "VIP",
        }),
      },
      invoice: {
        create: vi.fn().mockResolvedValue({
          id: "invoice-1",
        }),
      },
      paymentDeadline: {
        create: vi.fn().mockResolvedValue({
          id: "deadline-1",
        }),
      },
    });
    mockPrisma.$transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: "Serializable",
      });

      return callback(tx);
    });

    const res = await request
      .post("/api/seller/auctions/auction-1/decision")
      .set("Authorization", `Bearer ${sellerToken}`)
      .set("Idempotency-Key", "seller-decision-1")
      .send({
        decision: "accept",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      auctionId: "auction-1",
      newStatus: "PAYMENT_PENDING",
      invoiceId: "invoice-1",
    });
    expect(tx.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auctionId: "auction-1",
        buyerCompanyId: "buyer-company-1",
        sellerCompanyId: sellerCompanyId,
        subtotal: 120000,
        commission: 4800,
        vat: 6240,
        total: 131040,
        currency: "AED",
        status: "ISSUED",
        issuedAt: expect.any(Date),
        dueAt: expect.any(Date),
      }),
      select: {
        id: true,
      },
    });
    expect(tx.auction.update).toHaveBeenCalledWith({
      where: {
        id: "auction-1",
      },
      data: expect.objectContaining({
        state: "PAYMENT_PENDING",
        sellerDecision: "accepted",
        sellerDecidedAt: expect.any(Date),
        sellerDecidedBy: sellerUserId,
      }),
    });
    expect(tx.auctionStateTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auctionId: "auction-1",
        fromState: "AWAITING_SELLER_DECISION",
        toState: "PAYMENT_PENDING",
        trigger: "SELLER_ACCEPTED",
        actorId: sellerUserId,
      }),
    });
  });

  it("declines a seller decision and releases the winner lock", async () => {
    const tx = buildSellerTx({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "auction-2",
          state: "AWAITING_SELLER_DECISION",
          seller_company_id: sellerCompanyId,
          winner_company_id: "buyer-company-2",
          current_price: "90000.00",
          seller_decision: null,
        },
      ]),
      depositLock: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lock-1",
            walletId: "wallet-1",
            amount: "5000.00",
          },
        ]),
        update: vi.fn().mockResolvedValue({
          id: "lock-1",
        }),
      },
      wallet: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      walletLedger: {
        create: vi.fn().mockResolvedValue({
          id: "ledger-1",
        }),
      },
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/seller/auctions/auction-2/decision")
      .set("Authorization", `Bearer ${sellerToken}`)
      .set("Idempotency-Key", "seller-decision-2")
      .send({
        decision: "decline",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      auctionId: "auction-2",
      newStatus: "RELISTED",
      invoiceId: null,
    });
    expect(tx.depositLock.update).toHaveBeenCalledWith({
      where: {
        id: "lock-1",
      },
      data: expect.objectContaining({
        status: "RELEASED",
        releasedAt: expect.any(Date),
        resolutionReason: "SELLER_DECLINED",
      }),
    });
    expect(tx.auction.update).toHaveBeenCalledWith({
      where: {
        id: "auction-2",
      },
      data: expect.objectContaining({
        state: "RELISTED",
        sellerDecision: "declined",
        sellerDecidedAt: expect.any(Date),
        sellerDecidedBy: sellerUserId,
      }),
    });
    expect(mockDepositCommands.releaseAuctionBidsFromBuyingPower).toHaveBeenCalledWith(
      tx,
      "auction-2",
      ["buyer-company-2"],
      expect.any(Map),
    );
  });

  it("returns 409 when a decision is already recorded", async () => {
    const tx = buildSellerTx({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "auction-3",
          state: "AWAITING_SELLER_DECISION",
          seller_company_id: sellerCompanyId,
          winner_company_id: "buyer-company-3",
          current_price: "50000.00",
          seller_decision: "accepted",
        },
      ]),
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/seller/auctions/auction-3/decision")
      .set("Authorization", `Bearer ${sellerToken}`)
      .set("Idempotency-Key", "seller-decision-3")
      .send({
        decision: "accept",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("DECISION_ALREADY_MADE");
  });

  it("allows admin force-decision without seller auth", async () => {
    const tx = buildSellerTx({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "auction-4",
          state: "AWAITING_SELLER_DECISION",
          seller_company_id: "seller-company-2",
          winner_company_id: "buyer-company-4",
          current_price: "100000.00",
          seller_decision: null,
        },
      ]),
      company: {
        findUnique: vi.fn().mockResolvedValue({
          buyerTier: "STANDARD",
        }),
      },
      invoice: {
        create: vi.fn().mockResolvedValue({
          id: "invoice-4",
        }),
      },
      paymentDeadline: {
        create: vi.fn().mockResolvedValue({
          id: "deadline-4",
        }),
      },
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/admin/auctions/auction-4/force-decision")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        decision: "accept",
        reason: "Manual compliance override",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      auctionId: "auction-4",
      newStatus: "PAYMENT_PENDING",
      invoiceId: "invoice-4",
    });
  });
});

describe("GET /api/seller/vehicles", () => {
  it("returns 200 with vehicles array for seller", async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([
      {
        id: "v1",
        brand: "Toyota",
        model: "Land Cruiser",
        year: 2022,
        mileage: 15000,
        vin: "VIN001",
        images: [],
        auctions: [
          {
            id: "a1",
            state: "DRAFT",
            currentPrice: 10000,
            createdAt: new Date("2026-03-14T08:00:00.000Z"),
            startsAt: new Date("2026-03-14T08:00:00.000Z"),
            endsAt: new Date("2026-03-14T10:00:00.000Z"),
            decisionDeadlineAt: new Date("2026-03-15T10:00:00.000Z"),
          },
        ],
      },
    ]);

    const res = await request
      .get("/api/seller/vehicles")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.vehicles[0].id).toBe("v1");
    expect(res.body.vehicles[0].latestAuction.currentPrice).toBe(10000);
    expect(res.body.vehicles[0].latestAuction.decisionDeadlineAt).toBe("2026-03-15T10:00:00.000Z");
  });

  it("returns empty array when seller has no vehicles", async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([]);

    const res = await request
      .get("/api/seller/vehicles")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 0,
      vehicles: [],
    });
  });
});

describe("POST /api/seller/vehicles", () => {
  const validVehicle = {
    brand: "Toyota",
    model: "Land Cruiser",
    year: 2022,
    mileage: 15000,
    vin: "vin-unique-001",
  };

  it("returns 201 when vehicle is created", async () => {
    const tx = buildSellerTx();
    tx.vehicle.create.mockResolvedValue({
      id: "v-new",
      ...validVehicle,
      vin: "VIN-UNIQUE-001",
      marketPrice: null,
    });
    tx.auction.create.mockResolvedValue({
      id: "a-new",
      state: "DRAFT",
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/seller/vehicles")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send(validVehicle);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Vehicle added and auction draft created");
    expect(res.body.vehicle.id).toBe("v-new");
    expect(res.body.auctionId).toBe("a-new");
    expect(tx.auction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          minIncrement: 500,
          auctionStartsAt: null,
          auctionEndsAt: null,
          viewingEndsAt: null,
        }),
      }),
    );
  });

  it("stores inspection drop-off as informational only without deriving auction schedule", async () => {
    const tx = buildSellerTx();
    tx.vehicle.create.mockResolvedValue({
      id: "v-new",
      ...validVehicle,
      vin: "VIN-UNIQUE-001",
      marketPrice: null,
    });
    tx.auction.create.mockResolvedValue({
      id: "a-new",
      state: "DRAFT",
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/seller/vehicles")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        ...validVehicle,
        inspectionDropoffDate: "2026-04-10T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(tx.auction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionDropoffDate: new Date("2026-04-10T00:00:00.000Z"),
          viewingEndsAt: null,
          auctionStartsAt: null,
          auctionEndsAt: null,
        }),
      }),
    );
  });

  it("returns 400 when brand is missing", async () => {
    const res = await request
      .post("/api/seller/vehicles")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ ...validVehicle, brand: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });

  it("returns 400 when year is below 1886", async () => {
    const res = await request
      .post("/api/seller/vehicles")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ ...validVehicle, year: 1800 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when mileage is negative", async () => {
    const res = await request
      .post("/api/seller/vehicles")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ ...validVehicle, mileage: -1 });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/seller/vehicles/:id", () => {
  it("returns 200 with vehicle data", async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue({
      id: "v1",
      brand: "Toyota",
      model: "Land Cruiser",
      year: 2022,
      mileage: 15000,
      vin: "VIN001",
      marketPrice: 55000,
      fuelType: null,
      transmission: null,
      bodyType: null,
      regionSpec: null,
      condition: null,
      serviceHistory: null,
      description: null,
      engine: null,
      driveType: null,
      exteriorColor: null,
      interiorColor: null,
      airbags: null,
      damage: null,
      damageMap: null,
      images: [],
      auctions: [
        {
          id: "a1",
          state: "DRAFT",
          createdAt: new Date("2026-03-14T08:00:00.000Z"),
          startsAt: new Date("2026-03-14T08:00:00.000Z"),
          endsAt: new Date("2026-03-14T10:00:00.000Z"),
          inspectionDropoffDate: null,
          viewingEndsAt: null,
          auctionStartsAt: null,
          auctionEndsAt: null,
          currentPrice: 50000,
          startingPrice: 45000,
          buyNowPrice: null,
          minIncrement: 500,
          highestBidId: null,
        },
      ],
    });

    const res = await request
      .get("/api/seller/vehicles/v1")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.vehicle.id).toBe("v1");
    expect(res.body.latestAuction.id).toBe("a1");
  });

  it("returns 404 when vehicle is not found or outside seller scope", async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    const res = await request
      .get("/api/seller/vehicles/v-missing")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VEHICLE_NOT_FOUND");
  });
});

describe("PATCH /api/seller/vehicles/:id", () => {
  it("returns 200 when vehicle is updated", async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue({
      id: "v1",
      auctions: [
        {
          id: "a1",
          state: "DRAFT",
        },
      ],
    });

    const tx = buildSellerTx();
    tx.vehicle.update.mockResolvedValue({
      id: "v1",
      brand: "Nissan",
      model: "Patrol",
      year: 2023,
      mileage: 10000,
      vin: "VIN001",
      marketPrice: null,
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .patch("/api/seller/vehicles/v1")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ brand: "Nissan", model: "Patrol" });

    expect(res.status).toBe(200);
    expect(res.body.vehicle.id).toBe("v1");
    expect(res.body.vehicle.brand).toBe("Nissan");
  });

  it("returns 404 when vehicle is not found", async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    const res = await request
      .patch("/api/seller/vehicles/v-missing")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ brand: "Nissan" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VEHICLE_NOT_FOUND");
  });

  it("returns 409 when vehicle edit is locked", async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue({
      id: "v1",
      auctions: [
        {
          id: "a1",
          state: "LIVE",
        },
      ],
    });

    const res = await request
      .patch("/api/seller/vehicles/v1")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ brand: "Nissan" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("VEHICLE_EDIT_LOCKED");
  });
});

describe("DELETE /api/seller/vehicles/:id", () => {
  it("returns 200 when vehicle is deleted", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "a1",
        state: "DRAFT",
      },
    ]);

    const tx = buildSellerTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .delete("/api/seller/vehicles/v1")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
    });
  });

  it("returns 404 when vehicle is not found", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([]);

    const res = await request
      .delete("/api/seller/vehicles/v-missing")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VEHICLE_NOT_FOUND");
  });

  it("returns 409 when vehicle deletion is blocked", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "a1",
        state: "LIVE",
      },
    ]);

    const res = await request
      .delete("/api/seller/vehicles/v1")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("VEHICLE_DELETE_BLOCKED");
  });
});

describe("GET /api/seller/auctions", () => {
  it("returns 200 with auctions list", async () => {
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "a1",
        state: "DRAFT",
        vehicleId: "v1",
        currentPrice: 10000,
        startingPrice: 10000,
        minIncrement: 500,
        buyNowPrice: null,
        startsAt: new Date("2026-03-14T08:00:00.000Z"),
        endsAt: new Date("2026-03-14T10:00:00.000Z"),
        vehicle: {
          id: "v1",
          brand: "Toyota",
          model: "Land Cruiser",
          year: 2022,
          vin: "VIN001",
        },
        _count: {
          bids: 0,
        },
      },
    ]);

    const res = await request
      .get("/api/seller/auctions")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.auctions[0].id).toBe("a1");
  });
});

describe("POST /api/seller/auctions", () => {
  it("returns 201 when auction is created", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue(null);
    mockPrisma.vehicle.findUnique.mockResolvedValue({
      id: "v1",
    });

    const tx = buildSellerTx();
    tx.auction.create.mockResolvedValue({
      id: "a1",
      state: "DRAFT",
      vehicleId: "v1",
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/seller/auctions")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        vehicleId: "v1",
        startingPrice: 10000,
      });

    expect(res.status).toBe(201);
    expect(res.body.auction).toEqual({
      id: "a1",
      state: "DRAFT",
      vehicleId: "v1",
    });
    expect(tx.auction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          minIncrement: 500,
        }),
      }),
    );
  });

  it("returns 400 when vehicleId is missing", async () => {
    const res = await request
      .post("/api/seller/auctions")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });

  it("returns 404 when vehicle does not exist", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue(null);
    mockPrisma.vehicle.findUnique.mockResolvedValue(null);

    const res = await request
      .post("/api/seller/auctions")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        vehicleId: "v-missing",
        startingPrice: 10000,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VEHICLE_NOT_FOUND");
  });
});

describe("GET /api/seller/auctions/:id", () => {
  it("returns 200 with auction data", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue({
      id: "a1",
      state: "DRAFT",
      vehicleId: "v1",
      startsAt: new Date("2026-03-14T08:00:00.000Z"),
      endsAt: new Date("2026-03-14T10:00:00.000Z"),
      inspectionDropoffDate: null,
      viewingEndsAt: null,
      auctionStartsAt: null,
      auctionEndsAt: null,
      startingPrice: 10000,
      currentPrice: 10000,
      buyNowPrice: null,
      minIncrement: 500,
      _count: {
        bids: 1,
      },
      vehicle: {
        id: "v1",
        brand: "Toyota",
        model: "Land Cruiser",
        year: 2022,
        vin: "VIN001",
      },
    });
    mockPrisma.bid.findMany.mockResolvedValue([
      {
        id: "b1",
        amount: 10000,
        createdAt: new Date("2026-03-14T08:30:00.000Z"),
        companyId: "c1",
      },
    ]);
    mockPrisma.company.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Buyer Co",
      },
    ]);

    const res = await request
      .get("/api/seller/auctions/a1")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.auction.id).toBe("a1");
    expect(res.body.bids[0].companyName).toBe("Buyer Co");
  });

  it("returns 404 when auction is not found or outside seller scope", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue(null);

    const res = await request
      .get("/api/seller/auctions/a-missing")
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AUCTION_NOT_FOUND");
  });
});

describe("PATCH /api/seller/auctions/:id", () => {
  it("returns 200 when auction is updated", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue({
      id: "a1",
      state: "DRAFT",
      startsAt: new Date("2026-03-14T08:00:00.000Z"),
      endsAt: new Date("2026-03-14T10:00:00.000Z"),
    });

    const tx = buildSellerTx();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .patch("/api/seller/auctions/a1")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        startingPrice: 20000,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
    });
    expect(tx.auction.update).toHaveBeenCalledWith({
      where: {
        id: "a1",
      },
      data: {
        inspectionDropoffDate: undefined,
        viewingEndsAt: undefined,
        auctionStartsAt: undefined,
        auctionEndsAt: undefined,
        buyNowPrice: undefined,
        minIncrement: undefined,
      },
    });
  });

  it("returns 409 when seller tries to publish directly", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue({
      id: "a1",
      state: "DRAFT",
      startsAt: new Date("2026-03-14T08:00:00.000Z"),
      endsAt: new Date("2026-03-14T10:00:00.000Z"),
    });

    const res = await request
      .patch("/api/seller/auctions/a1")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        action: "publish",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ADMIN_APPROVAL_REQUIRED");
  });

  it("returns 404 when auction is not found", async () => {
    mockPrisma.auction.findFirst.mockResolvedValue(null);

    const res = await request
      .patch("/api/seller/auctions/a-missing")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        startingPrice: 20000,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AUCTION_NOT_FOUND");
  });
});
