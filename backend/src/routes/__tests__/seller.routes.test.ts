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
    },
    company: {
      findMany: vi.fn(),
    },
    bid: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));

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
