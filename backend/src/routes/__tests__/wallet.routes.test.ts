import { createHash, randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    idempotencyKey: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    invoice: {
      findUnique: vi.fn(),
    },
    paymentDeadline: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
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

async function makeDepositRequestHash(amount: number): Promise<string> {
  return createHash("sha256")
    .update(
      JSON.stringify({
        amount,
      }),
    )
    .digest("hex");
}

function buildWalletTx(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: vi.fn(),
    },
    wallet: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    walletLedger: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    invoice: {
      findUnique: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ...overrides,
  };
}

let server: FastifyInstance;
let request: ReturnType<typeof supertest>;
let buyerToken: string;
let kycBuyerToken: string;

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "test";
  delete process.env.STRIPE_SECRET_KEY;
  server = await buildServer();
  await server.ready();
  request = supertest(server.server);

  buyerToken = await makeToken({
    userId: buyerUserId,
    role: "BUYER",
    companyId: buyerCompanyId,
    kycVerified: false,
  });
  kycBuyerToken = await makeToken({
    userId: buyerUserId,
    role: "BUYER",
    companyId: buyerCompanyId,
    kycVerified: true,
  });
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/wallet", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.get("/api/wallet");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 200 with wallet data and ledger", async () => {
    const tx = buildWalletTx();
    tx.user.findUnique.mockResolvedValue({
      id: buyerUserId,
    });
    tx.wallet.upsert.mockResolvedValue({
      id: "w1",
      userId: buyerUserId,
      balance: 10000,
      lockedBalance: 5000,
    });
    tx.walletLedger.findMany.mockResolvedValue([
      {
        id: "l1",
        type: "DEPOSIT_TOPUP",
        amount: 10000,
        reference: "dep-1",
        createdAt: new Date("2026-03-14T08:00:00.000Z"),
      },
    ]);
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .get("/api/wallet")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.wallet.balance).toBe(10000);
    expect(res.body.wallet.availableBalance).toBe(5000);
    expect(Array.isArray(res.body.ledger)).toBe(true);
  });

  it("returns 404 when wallet user does not exist", async () => {
    const tx = buildWalletTx();
    tx.user.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .get("/api/wallet")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("WALLET_USER_NOT_FOUND");
  });
});

describe("POST /api/wallet/deposit", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.post("/api/wallet/deposit").send({
      amount: 5000,
      idempotencyKey: "dep-001",
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when buyer KYC is pending", async () => {
    const res = await request
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        amount: 5000,
        idempotencyKey: "dep-001",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("KYC_PENDING");
  });

  it("returns 200 when deposit is processed", async () => {
    mockPrisma.idempotencyKey.findFirst.mockResolvedValue(null);
    mockPrisma.idempotencyKey.create.mockResolvedValue({ id: "ik1" });
    mockPrisma.idempotencyKey.updateMany.mockResolvedValue({ count: 1 });

    const tx = buildWalletTx();
    tx.user.findUnique.mockResolvedValue({
      id: buyerUserId,
    });
    tx.wallet.upsert.mockResolvedValue({
      id: "w1",
      userId: buyerUserId,
      balance: 10000,
      lockedBalance: 0,
    });
    tx.wallet.update.mockResolvedValue({
      id: "w1",
      userId: buyerUserId,
      balance: 15000,
      lockedBalance: 0,
    });
    tx.walletLedger.create.mockResolvedValue({
      id: "l1",
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${kycBuyerToken}`)
      .send({
        amount: 5000,
        idempotencyKey: "dep-001",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: "accepted",
      wallet_id: "w1",
      user_id: buyerUserId,
      amount: 5000,
      balance: 15000,
      available_balance: 15000,
      ledger_id: "l1",
    });
  });

  it("returns cached response for duplicate idempotency key", async () => {
    const cachedBody = {
      result: "accepted",
      wallet: {
        balance: 15000,
      },
    };
    mockPrisma.idempotencyKey.findFirst.mockResolvedValue({
      requestHash: await makeDepositRequestHash(5000),
      status: "COMPLETED",
      responseStatus: 200,
      responseBody: JSON.stringify(cachedBody),
    });

    const res = await request
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${kycBuyerToken}`)
      .send({
        amount: 5000,
        idempotencyKey: "dep-001",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedBody);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when amount is zero", async () => {
    const res = await request
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${kycBuyerToken}`)
      .send({
        amount: 0,
        idempotencyKey: "dep-002",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });

  it("returns 400 when amount is negative", async () => {
    const res = await request
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${kycBuyerToken}`)
      .send({
        amount: -100,
        idempotencyKey: "dep-003",
      });

    expect(res.status).toBe(400);
  });

  it("returns 400 when idempotencyKey is missing", async () => {
    const res = await request
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${kycBuyerToken}`)
      .send({
        amount: 1000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });
});

describe("POST /api/wallet/withdraw", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.post("/api/wallet/withdraw").send({
      amount: 2000,
    });

    expect(res.status).toBe(401);
  });

  it("returns 200 when withdrawal is processed", async () => {
    const tx = buildWalletTx();
    tx.user.findUnique.mockResolvedValue({
      id: buyerUserId,
    });
    tx.wallet.upsert.mockResolvedValue({
      id: "w1",
      userId: buyerUserId,
      balance: 10000,
      lockedBalance: 2000,
    });
    tx.$queryRaw.mockResolvedValue([
      {
        id: "w1",
        user_id: buyerUserId,
        balance: 10000,
        locked_balance: 2000,
      },
    ]);
    tx.wallet.update.mockResolvedValue({
      id: "w1",
      userId: buyerUserId,
      balance: 8000,
      lockedBalance: 2000,
    });
    tx.walletLedger.create.mockResolvedValue({
      id: "l2",
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        amount: 2000,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: "accepted",
      wallet_id: "w1",
      user_id: buyerUserId,
      amount: 2000,
      balance: 8000,
      available_balance: 6000,
      ledger_id: "l2",
    });
  });

  it("returns 409 when withdrawal exceeds available balance", async () => {
    const tx = buildWalletTx();
    tx.user.findUnique.mockResolvedValue({
      id: buyerUserId,
    });
    tx.wallet.upsert.mockResolvedValue({
      id: "w1",
      userId: buyerUserId,
      balance: 5000,
      lockedBalance: 4000,
    });
    tx.$queryRaw.mockResolvedValue([
      {
        id: "w1",
        user_id: buyerUserId,
        balance: 5000,
        locked_balance: 4000,
      },
    ]);
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const res = await request
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        amount: 3000,
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "WALLET_INSUFFICIENT_BALANCE",
      availableBalance: 1000,
    });
  });

  it("returns 400 when amount is zero", async () => {
    const res = await request
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        amount: 0,
      });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/payments/invoices/:invoiceId", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.get("/api/payments/invoices/inv1");

    expect(res.status).toBe(401);
  });

  it("returns 200 with invoice data", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      auctionId: "a1",
      buyerCompanyId: buyerCompanyId,
      sellerCompanyId: "seller-company",
      subtotal: 50000,
      commission: 3000,
      vat: 2500,
      total: 55500,
      currency: "AED",
      status: "ISSUED",
      issuedAt: new Date("2026-03-14T08:00:00.000Z"),
      dueAt: new Date("2026-03-16T08:00:00.000Z"),
      paidAt: null,
      auction: {
        id: "a1",
        state: "PAYMENT_PENDING",
        vehicleId: "v1",
        sellerCompanyId: "seller-company",
        winnerCompanyId: buyerCompanyId,
        currentPrice: 50000,
      },
      payments: [
        {
          id: "p1",
          status: "PENDING",
          amount: 55500,
          currency: "AED",
          stripePaymentIntentId: null,
          createdAt: new Date("2026-03-14T08:10:00.000Z"),
          updatedAt: new Date("2026-03-14T08:10:00.000Z"),
        },
      ],
    });
    mockPrisma.paymentDeadline.findFirst.mockResolvedValue(null);

    const res = await request
      .get("/api/payments/invoices/inv1")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.invoice.id).toBe("inv1");
    expect(res.body.invoice.total).toBe(55500);
    expect(Array.isArray(res.body.payments)).toBe(true);
  });

  it("returns 404 when invoice is not found", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);

    const res = await request
      .get("/api/payments/invoices/missing")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("INVOICE_NOT_FOUND");
  });
});

describe("POST /api/payments/invoices/:invoiceId/intent", () => {
  it("returns 401 without auth token", async () => {
    const res = await request
      .post("/api/payments/invoices/inv1/intent")
      .set("idempotency-key", "intent-1")
      .send({});

    expect(res.status).toBe(401);
  });

  it("returns 400 when idempotency header is missing", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      auctionId: "a1",
      buyerCompanyId: buyerCompanyId,
      sellerCompanyId: "seller-company",
      total: 55500,
      currency: "AED",
      status: "ISSUED",
    });

    const res = await request
      .post("/api/payments/invoices/inv1/intent")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("returns 200 with mock payment intent when Stripe key is absent", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      auctionId: "a1",
      buyerCompanyId: buyerCompanyId,
      sellerCompanyId: "seller-company",
      total: 55500,
      currency: "AED",
      status: "ISSUED",
    });

    const prepareTx = buildWalletTx();
    prepareTx.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      total: 55500,
      currency: "AED",
      status: "ISSUED",
    });
    prepareTx.payment.findFirst.mockResolvedValue(null);
    prepareTx.payment.create.mockResolvedValue({
      id: "p1",
      amount: 55500,
      currency: "AED",
    });

    const attachTx = buildWalletTx();
    attachTx.payment.findUnique.mockResolvedValue({
      id: "p1",
      invoiceId: "inv1",
      amount: 55500,
      currency: "AED",
      stripePaymentIntentId: null,
    });
    attachTx.payment.update.mockResolvedValue({
      id: "p1",
      invoiceId: "inv1",
      amount: 55500,
      currency: "AED",
      stripePaymentIntentId: "pi_mock_p1",
    });

    mockPrisma.$transaction
      .mockImplementationOnce(async (callback) => callback(prepareTx))
      .mockImplementationOnce(async (callback) => callback(attachTx));

    const res = await request
      .post("/api/payments/invoices/inv1/intent")
      .set("Authorization", `Bearer ${buyerToken}`)
      .set("idempotency-key", "intent-1")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("accepted");
    expect(res.body.invoice_id).toBe("inv1");
    expect(res.body.payment_id).toBe("p1");
    expect(res.body.mock).toBe(true);
  });
});
