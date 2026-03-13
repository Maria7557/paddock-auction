import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
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
};

vi.mock("../../db", () => ({
  prisma: mockPrisma,
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
  delete process.env.STRIPE_SECRET_KEY;
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.resetModules();
});

describe("walletRoutes", () => {
  it("returns wallet balance and recent ledger entries", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });
    const txMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
        }),
      },
      wallet: {
        upsert: vi.fn().mockResolvedValue({
          id: "wallet-1",
          userId: "user-1",
          balance: "150.00",
          lockedBalance: "40.00",
        }),
      },
      walletLedger: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "ledger-1",
            type: "DEPOSIT_TOPUP",
            amount: "150.00",
            reference: "deposit-1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(txMock));

    const response = await server.inject({
      method: "GET",
      url: "/wallet?limit=5",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      wallet: {
        id: "wallet-1",
        userId: "user-1",
        balance: 150,
        lockedBalance: 40,
        availableBalance: 110,
      },
      ledger: [
        {
          id: "ledger-1",
          type: "DEPOSIT_TOPUP",
          amount: 150,
          reference: "deposit-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await server.close();
  });

  it("tops up the wallet in a Serializable transaction and stores idempotency state", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });
    const txMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
        }),
      },
      wallet: {
        upsert: vi.fn().mockResolvedValue({
          id: "wallet-1",
          userId: "user-1",
          balance: "20.00",
          lockedBalance: "0.00",
        }),
        update: vi.fn().mockResolvedValue({
          id: "wallet-1",
          userId: "user-1",
          balance: "120.00",
          lockedBalance: "0.00",
        }),
      },
      walletLedger: {
        create: vi.fn().mockResolvedValue({
          id: "ledger-1",
        }),
      },
    };

    mockPrisma.idempotencyKey.findFirst.mockResolvedValue(null);
    mockPrisma.idempotencyKey.create.mockResolvedValue({
      id: "idempotency-1",
    });
    mockPrisma.idempotencyKey.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrisma.$transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: "Serializable",
      });

      return callback(txMock);
    });

    const response = await server.inject({
      method: "POST",
      url: "/wallet/deposit",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        amount: 100,
        idempotencyKey: "deposit-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      result: "accepted",
      wallet_id: "wallet-1",
      user_id: "user-1",
      amount: 100,
      balance: 120,
      available_balance: 120,
      ledger_id: "ledger-1",
    });
    expect(mockPrisma.idempotencyKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        endpoint: "/wallet/deposit",
        idempotencyKey: "deposit-1",
        status: "PENDING",
      }),
    });
    expect(mockPrisma.idempotencyKey.updateMany).toHaveBeenCalledWith({
      where: {
        actorId: "user-1",
        endpoint: "/wallet/deposit",
        idempotencyKey: "deposit-1",
      },
      data: {
        status: "COMPLETED",
        responseStatus: 200,
        responseBody: JSON.stringify({
          result: "accepted",
          wallet_id: "wallet-1",
          user_id: "user-1",
          amount: 100,
          balance: 120,
          available_balance: 120,
          ledger_id: "ledger-1",
        }),
      },
    });

    await server.close();
  });

  it("rejects withdraw when available balance would go negative", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
    });
    const txMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
        }),
      },
      wallet: {
        upsert: vi.fn().mockResolvedValue({
          id: "wallet-1",
          userId: "user-1",
          balance: "100.00",
          lockedBalance: "30.00",
        }),
        update: vi.fn(),
      },
      walletLedger: {
        create: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "wallet-1",
          user_id: "user-1",
          balance: "100.00",
          locked_balance: "30.00",
        },
      ]),
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(txMock));

    const response = await server.inject({
      method: "POST",
      url: "/wallet/withdraw",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        amount: 80,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "WALLET_INSUFFICIENT_BALANCE",
      availableBalance: 70,
    });
    expect(txMock.wallet.update).not.toHaveBeenCalled();
    expect(txMock.walletLedger.create).not.toHaveBeenCalled();

    await server.close();
  });

  it("creates a mock payment intent when Stripe is not configured", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-1",
      role: "BUYER",
      companyId: "company-1",
      email: "buyer@example.com",
      kycVerified: true,
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

    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "invoice-1",
      auctionId: "auction-1",
      buyerCompanyId: "company-1",
      sellerCompanyId: "seller-1",
      total: "250.00",
      currency: "AED",
      status: "ISSUED",
    });
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

    await server.close();
  });
});
