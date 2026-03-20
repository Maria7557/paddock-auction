import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockStripe } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    depositWallet: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    paymentWebhookEvent: {
      create: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    paymentDeadline: {
      findFirst: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  },
  mockStripe: {
    paymentIntents: {
      create: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/stripe", () => ({ stripe: mockStripe }));

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

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "test";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  server = await buildServer();
  await server.ready();
  request = supertest(server.server);

  buyerToken = await makeToken({
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
  mockPrisma.depositWallet.findUnique.mockResolvedValue(null);
});

describe("GET /api/wallet", () => {
  it("returns 401 without auth token", async () => {
    const res = await request.get("/api/wallet");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns decimal-string balances for an authenticated buyer", async () => {
    mockPrisma.depositWallet.findUnique.mockResolvedValue({
      availableBalance: "38500.00",
      lockedBalance: "5000.00",
      pendingWithdrawalBalance: "0.00",
      currency: "AED",
    });

    const res = await request
      .get("/api/wallet")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      availableBalance: "38500.00",
      lockedBalance: "5000.00",
      pendingWithdrawalBalance: "0.00",
      currency: "AED",
    });
  });
});

describe("POST /api/wallet/topup", () => {
  it("returns 400 when the Idempotency-Key header is missing", async () => {
    const res = await request
      .post("/api/wallet/topup")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        amount: 5000,
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "MISSING_IDEMPOTENCY_KEY",
    });
  });

  it("returns a Stripe client secret for a valid top-up request", async () => {
    mockStripe.paymentIntents.create.mockResolvedValue({
      id: "pi_server_1",
      client_secret: "pi_server_secret_1",
    });

    const res = await request
      .post("/api/wallet/topup")
      .set("Authorization", `Bearer ${buyerToken}`)
      .set("Idempotency-Key", "server-topup-1")
      .send({
        amount: 5000,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      clientSecret: "pi_server_secret_1",
      paymentIntentId: "pi_server_1",
    });
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500000,
        currency: "aed",
        metadata: expect.objectContaining({
          companyId: buyerCompanyId,
          userId: buyerUserId,
          purpose: "deposit_topup",
        }),
      }),
      {
        idempotencyKey: "server-topup-1",
      },
    );
  });
});

describe("POST /api/stripe/webhook", () => {
  it("is registered without auth middleware and rejects invalid signatures with 400", async () => {
    mockStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const res = await request
      .post("/api/stripe/webhook")
      .set("stripe-signature", "bad-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify({ id: "evt_invalid" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_signature",
    });
  });
});
