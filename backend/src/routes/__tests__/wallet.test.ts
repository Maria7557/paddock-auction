import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockStripe } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    depositWallet: {
      findUnique: vi.fn(),
    },
    invoice: {
      findUnique: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockStripe: {
    paymentIntents: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../lib/stripe", () => ({
  stripe: mockStripe,
}));

async function signToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
  email?: string;
  kycVerified?: boolean;
}): Promise<string> {
  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
    email: payload.email,
    kycVerified: payload.kycVerified,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function buildTestServer(): Promise<FastifyInstance> {
  const { walletRoutes } = await import("../wallet");
  const server = Fastify();

  await server.register(cookie);
  await server.register(walletRoutes);
  await server.ready();

  return server;
}

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-32-chars-long-enough!!";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    role: "BUYER",
    status: "ACTIVE",
    kycVerified: true,
    companyUsers: [
      {
        companyId: "company-1",
        company: {
          status: "ACTIVE",
        },
      },
    ],
  });
});

afterEach(async () => {
  vi.resetModules();
});

describe("walletRoutes", () => {
  it("returns zero balances when the deposit wallet does not exist", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });

    mockPrisma.depositWallet.findUnique.mockResolvedValue(null);

    const response = await server.inject({
      method: "GET",
      url: "/wallet",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      availableBalance: "0.00",
      lockedBalance: "0.00",
      pendingWithdrawalBalance: "0.00",
      currency: "AED",
    });

    await server.close();
  });

  it("returns deposit wallet balances as decimal strings", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });

    mockPrisma.depositWallet.findUnique.mockResolvedValue({
      availableBalance: "38500.00",
      lockedBalance: "5000.00",
      pendingWithdrawalBalance: "0.00",
      currency: "AED",
    });

    const response = await server.inject({
      method: "GET",
      url: "/wallet",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      availableBalance: "38500.00",
      lockedBalance: "5000.00",
      pendingWithdrawalBalance: "0.00",
      currency: "AED",
    });

    await server.close();
  });

  it("creates a Stripe payment intent for wallet top-up using the header idempotency key", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });

    mockStripe.paymentIntents.create.mockResolvedValue({
      id: "pi_topup_1",
      client_secret: "pi_topup_secret_1",
    });

    const response = await server.inject({
      method: "POST",
      url: "/wallet/topup",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "topup-1",
      },
      payload: {
        amount: 5000,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      clientSecret: "pi_topup_secret_1",
      paymentIntentId: "pi_topup_1",
    });
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 500000,
        currency: "aed",
        metadata: {
          companyId: "company-1",
          userId: "user-1",
          purpose: "deposit_topup",
        },
        automatic_payment_methods: {
          enabled: true,
        },
      },
      {
        idempotencyKey: "topup-1",
      },
    );

    await server.close();
  });

  it("returns 400 when the top-up idempotency header is missing", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });

    const response = await server.inject({
      method: "POST",
      url: "/wallet/topup",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        amount: 5000,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "MISSING_IDEMPOTENCY_KEY",
    });

    await server.close();
  });

  it("returns 400 when the top-up amount is below the minimum", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });

    const response = await server.inject({
      method: "POST",
      url: "/wallet/topup",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "topup-too-small",
      },
      payload: {
        amount: 4999,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("INVALID_REQUEST");

    await server.close();
  });

  it("returns 502 when Stripe payment intent creation fails", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });

    mockStripe.paymentIntents.create.mockRejectedValue(new Error("stripe unavailable"));

    const response = await server.inject({
      method: "POST",
      url: "/wallet/topup",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "topup-failure",
      },
      payload: {
        amount: 5000,
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "payment_provider_error",
    });

    await server.close();
  });

  it("keeps invoice payment-intent creation working when Stripe is absent for that legacy path", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });

    const previousStripeSecret = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "invoice-1",
      auctionId: "auction-1",
      buyerCompanyId: "company-1",
      sellerCompanyId: "seller-1",
      total: "250.00",
      currency: "AED",
      status: "ISSUED",
    });

    const prepareTx = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: "invoice-1",
          total: "250.00",
          currency: "AED",
          status: "ISSUED",
        }),
      },
      payment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "payment-1",
          amount: "250.00",
          currency: "AED",
        }),
      },
    };
    const attachTx = {
      payment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "payment-1",
          invoiceId: "invoice-1",
          amount: "250.00",
          currency: "AED",
          stripePaymentIntentId: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "payment-1",
          invoiceId: "invoice-1",
          amount: "250.00",
          currency: "AED",
          stripePaymentIntentId: "pi_mock_payment1",
        }),
      },
    };

    mockPrisma.$transaction
      .mockImplementationOnce(async (callback, options) => {
        expect(options).toEqual({
          isolationLevel: "Serializable",
        });

        return callback(prepareTx);
      })
      .mockImplementationOnce(async (callback, options) => {
        expect(options).toEqual({
          isolationLevel: "Serializable",
        });

        return callback(attachTx);
      });

    const response = await server.inject({
      method: "POST",
      url: "/payments/invoices/invoice-1/intent",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "intent-1",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      result: "accepted",
      replayed: false,
      invoice_id: "invoice-1",
      payment_id: "payment-1",
      stripe_payment_intent_id: "pi_mock_payment1",
      clientSecret: "pi_mock_secret_payment1",
      client_secret: "pi_mock_secret_payment1",
      amount: 250,
      currency: "AED",
      mock: true,
    });

    process.env.STRIPE_SECRET_KEY = previousStripeSecret;
    await server.close();
  });
});
