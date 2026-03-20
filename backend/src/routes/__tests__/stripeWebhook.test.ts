import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockStripe } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
  },
  mockStripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../lib/stripe", () => ({
  stripe: mockStripe,
}));

async function buildTestServer(): Promise<FastifyInstance> {
  const { stripeWebhookRoutes } = await import("../stripeWebhook");
  const server = Fastify();

  await server.register(stripeWebhookRoutes);
  await server.ready();

  return server;
}

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.resetModules();
});

describe("stripeWebhookRoutes", () => {
  it("returns 400 when Stripe signature verification fails", async () => {
    const server = await buildTestServer();

    mockStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await server.inject({
      method: "POST",
      url: "/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "invalid",
      },
      payload: JSON.stringify({
        id: "evt_invalid",
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_signature",
    });

    await server.close();
  });

  it("credits the deposit wallet when a top-up payment intent succeeds", async () => {
    const server = await buildTestServer();
    const txMock = {
      paymentWebhookEvent: {
        create: vi.fn().mockResolvedValue({
          id: "evt-row-1",
        }),
        update: vi.fn().mockResolvedValue({
          id: "evt-row-1",
        }),
      },
      depositWallet: {
        upsert: vi.fn().mockResolvedValue({
          id: "wallet-1",
        }),
        update: vi.fn().mockResolvedValue({
          id: "wallet-1",
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    mockStripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_success_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_success_1",
          amount: 500000,
          amount_received: 500000,
          metadata: {
            companyId: "company-1",
            purpose: "deposit_topup",
          },
        },
      },
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(txMock));

    const response = await server.inject({
      method: "POST",
      url: "/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid",
      },
      payload: JSON.stringify({
        id: "evt_success_1",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      received: true,
    });
    expect(txMock.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripeEventId: "evt_success_1",
        eventType: "payment_intent.succeeded",
        payloadHash: expect.any(String),
      }),
    });
    expect(txMock.depositWallet.upsert).toHaveBeenCalledWith({
      where: {
        companyId_currency: {
          companyId: "company-1",
          currency: "AED",
        },
      },
      update: {},
      create: {
        companyId: "company-1",
        currency: "AED",
      },
      select: {
        id: true,
      },
    });
    expect(txMock.$queryRaw).toHaveBeenCalled();
    expect(txMock.depositWallet.update).toHaveBeenCalledWith({
      where: {
        id: "wallet-1",
      },
      data: {
        availableBalance: {
          increment: "5000.00",
        },
      },
    });
    expect(txMock.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: {
        stripeEventId: "evt_success_1",
      },
      data: {
        status: "PROCESSED",
        processedAt: expect.any(Date),
      },
    });

    await server.close();
  });

  it("ignores succeeded payment intents that are not deposit top-ups", async () => {
    const server = await buildTestServer();
    const txMock = {
      paymentWebhookEvent: {
        create: vi.fn().mockResolvedValue({
          id: "evt-row-2",
        }),
        update: vi.fn().mockResolvedValue({
          id: "evt-row-2",
        }),
      },
      depositWallet: {
        upsert: vi.fn(),
        update: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    mockStripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_ignore_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_ignore_1",
          amount: 500000,
          amount_received: 500000,
          metadata: {
            companyId: "company-1",
            purpose: "invoice_payment",
          },
        },
      },
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(txMock));

    const response = await server.inject({
      method: "POST",
      url: "/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid",
      },
      payload: JSON.stringify({
        id: "evt_ignore_1",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(txMock.depositWallet.upsert).not.toHaveBeenCalled();
    expect(txMock.depositWallet.update).not.toHaveBeenCalled();
    expect(txMock.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: {
        stripeEventId: "evt_ignore_1",
      },
      data: {
        status: "IGNORED",
        processedAt: expect.any(Date),
      },
    });

    await server.close();
  });

  it("marks failed payment intents as processed without mutating the wallet", async () => {
    const server = await buildTestServer();
    const txMock = {
      paymentWebhookEvent: {
        create: vi.fn().mockResolvedValue({
          id: "evt-row-3",
        }),
        update: vi.fn().mockResolvedValue({
          id: "evt-row-3",
        }),
      },
      depositWallet: {
        upsert: vi.fn(),
        update: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    mockStripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_failed_1",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_failed_1",
          amount: 500000,
          amount_received: 0,
          metadata: {
            companyId: "company-1",
            purpose: "deposit_topup",
          },
          last_payment_error: {
            code: "card_declined",
            message: "Card declined",
          },
        },
      },
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(txMock));

    const response = await server.inject({
      method: "POST",
      url: "/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid",
      },
      payload: JSON.stringify({
        id: "evt_failed_1",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(txMock.depositWallet.upsert).not.toHaveBeenCalled();
    expect(txMock.depositWallet.update).not.toHaveBeenCalled();
    expect(txMock.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: {
        stripeEventId: "evt_failed_1",
      },
      data: {
        status: "PROCESSED",
        processedAt: expect.any(Date),
      },
    });

    await server.close();
  });

  it("returns 200 immediately when the webhook event was already processed", async () => {
    const server = await buildTestServer();

    mockStripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_duplicate_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_duplicate_1",
          amount: 500000,
          amount_received: 500000,
          metadata: {
            companyId: "company-1",
            purpose: "deposit_topup",
          },
        },
      },
    });
    mockPrisma.$transaction.mockRejectedValue({
      code: "P2002",
    });

    const response = await server.inject({
      method: "POST",
      url: "/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid",
      },
      payload: JSON.stringify({
        id: "evt_duplicate_1",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      received: true,
    });

    await server.close();
  });
});
