import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Stripe from "stripe";

import { prisma } from "../db";

const DEPOSIT_WALLET_CURRENCY = "AED";
const DEPOSIT_TOPUP_PURPOSE = "deposit_topup";

type StripeWebhookRequest = FastifyRequest<{
  Body: Buffer | string;
}>;

type WebhookTx = {
  paymentWebhookEvent: {
    create: (input: {
      data: {
        stripeEventId: string;
        eventType: string;
        payloadHash: string;
        status: "PROCESSED" | "IGNORED" | "FAILED";
        processedAt: Date;
      };
    }) => Promise<unknown>;
  };
  depositWallet: {
    upsert: (input: {
      where: {
        companyId_currency: {
          companyId: string;
          currency: string;
        };
      };
      update: {};
      create: {
        companyId: string;
        currency: string;
      };
      select: {
        id: true;
      };
    }) => Promise<{ id: string }>;
    update: (input: {
      where: { id: string };
      data: {
        availableBalance: {
          increment: string;
        };
      };
    }) => Promise<unknown>;
  };
  wallet: {
    upsert: (input: {
      where: {
        userId: string;
      };
      create: {
        userId: string;
        balance: string;
      };
      update: {
        balance: {
          increment: string;
        };
      };
    }) => Promise<unknown>;
  };
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }

  return webhookSecret;
}

function getStripeSignature(request: StripeWebhookRequest): string | null {
  const signature = request.headers["stripe-signature"]?.toString().trim();

  if (!signature) {
    return null;
  }

  return signature;
}

function getRawBodyBuffer(body: Buffer | string | undefined): Buffer {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  return Buffer.alloc(0);
}

function hashPayload(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

function getSucceededAmountInFils(paymentIntent: Stripe.PaymentIntent): number | null {
  const amountInFils =
    typeof paymentIntent.amount_received === "number" && paymentIntent.amount_received > 0
      ? paymentIntent.amount_received
      : paymentIntent.amount;

  if (!Number.isInteger(amountInFils) || amountInFils <= 0) {
    return null;
  }

  return amountInFils;
}

function formatFilsAsAed(amountInFils: number): string {
  const whole = Math.floor(amountInFils / 100);
  const fractional = String(amountInFils % 100).padStart(2, "0");

  return `${whole}.${fractional}`;
}

async function persistWebhookEvent(
  tx: WebhookTx,
  input: {
    stripeEventId: string;
    eventType: string;
    payloadHash: string;
    status: "PROCESSED" | "IGNORED" | "FAILED";
  },
): Promise<void> {
  await tx.paymentWebhookEvent.create({
    data: {
      stripeEventId: input.stripeEventId,
      eventType: input.eventType,
      payloadHash: input.payloadHash,
      status: input.status,
      processedAt: new Date(),
    },
  });
}

async function handlePaymentIntentSucceeded(
  tx: WebhookTx,
  input: {
    stripeEventId: string;
    eventType: string;
    payloadHash: string;
    paymentIntent: Stripe.PaymentIntent;
  },
  request: StripeWebhookRequest,
): Promise<void> {
  const purpose = input.paymentIntent.metadata?.purpose?.trim();

  if (purpose !== DEPOSIT_TOPUP_PURPOSE) {
    await persistWebhookEvent(tx, {
      stripeEventId: input.stripeEventId,
      eventType: input.eventType,
      payloadHash: input.payloadHash,
      status: "IGNORED",
    });
    return;
  }

  const companyId = input.paymentIntent.metadata?.companyId?.trim();
  const userId = input.paymentIntent.metadata?.userId?.trim();
  const amountInFils = getSucceededAmountInFils(input.paymentIntent);

  if (!companyId || !userId || !amountInFils) {
    request.log.error(
      {
        stripeEventId: input.stripeEventId,
        paymentIntentId: input.paymentIntent.id,
        companyId,
        userId,
        amountInFils,
      },
      "Stripe deposit top-up metadata was invalid",
    );

    await persistWebhookEvent(tx, {
      stripeEventId: input.stripeEventId,
      eventType: input.eventType,
      payloadHash: input.payloadHash,
      status: "FAILED",
    });
    return;
  }

  const amountAed = formatFilsAsAed(amountInFils);
  const wallet = await tx.depositWallet.upsert({
    where: {
      companyId_currency: {
        companyId,
        currency: DEPOSIT_WALLET_CURRENCY,
      },
    },
    update: {},
    create: {
      companyId,
      currency: DEPOSIT_WALLET_CURRENCY,
    },
    select: {
      id: true,
    },
  });

  await tx.$queryRaw`
    SELECT id
    FROM "deposit_wallets"
    WHERE id = ${wallet.id}
    FOR UPDATE
  `;

  await tx.depositWallet.update({
    where: {
      id: wallet.id,
    },
    data: {
      availableBalance: {
        increment: amountAed,
      },
    },
  });

  await tx.wallet.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      balance: amountAed,
    },
    update: {
      balance: {
        increment: amountAed,
      },
    },
  });

  await persistWebhookEvent(tx, {
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    payloadHash: input.payloadHash,
    status: "PROCESSED",
  });
}

async function handlePaymentIntentFailed(
  tx: WebhookTx,
  input: {
    stripeEventId: string;
    eventType: string;
    payloadHash: string;
    paymentIntent: Stripe.PaymentIntent;
  },
  request: StripeWebhookRequest,
): Promise<void> {
  request.log.warn(
    {
      stripeEventId: input.stripeEventId,
      paymentIntentId: input.paymentIntent.id,
      companyId: input.paymentIntent.metadata?.companyId?.trim() || null,
      userId: input.paymentIntent.metadata?.userId?.trim() || null,
      failureCode: input.paymentIntent.last_payment_error?.code || null,
      failureMessage: input.paymentIntent.last_payment_error?.message || null,
    },
    "Stripe deposit top-up payment failed",
  );

  await persistWebhookEvent(tx, {
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    payloadHash: input.payloadHash,
    status: "PROCESSED",
  });
}

export async function stripeWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser(
    "application/json",
    {
      parseAs: "buffer",
    },
    function stripeWebhookJsonParser(_request, body, done): void {
      done(null, body);
    },
  );

  fastify.post<{ Body: Buffer | string }>(
    "/stripe/webhook",
    async function stripeWebhookHandler(
      request: StripeWebhookRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const signature = getStripeSignature(request);
      const rawBody = getRawBodyBuffer(request.body);

      if (!signature || rawBody.length === 0) {
        await reply.code(400).send({
          error: "invalid_signature",
        });
        return;
      }

      let event: Stripe.Event;

      try {
        const { stripe } = await import("../lib/stripe");
        event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
      } catch (error) {
        request.log.warn(
          {
            err: error,
          },
          "Stripe webhook signature verification failed",
        );
        await reply.code(400).send({
          error: "invalid_signature",
        });
        return;
      }

      const payloadHash = hashPayload(rawBody);

      try {
        if (event.type === "payment_intent.succeeded") {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          await prisma.$transaction(
            async (tx) => {
              await handlePaymentIntentSucceeded(
                tx as unknown as WebhookTx,
                {
                  stripeEventId: event.id,
                  eventType: event.type,
                  payloadHash,
                  paymentIntent,
                },
                request,
              );
            },
            {
              isolationLevel: "Serializable",
            },
          );
        } else if (event.type === "payment_intent.payment_failed") {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          await prisma.$transaction(
            async (tx) => {
              await handlePaymentIntentFailed(
                tx as unknown as WebhookTx,
                {
                  stripeEventId: event.id,
                  eventType: event.type,
                  payloadHash,
                  paymentIntent,
                },
                request,
              );
            },
            {
              isolationLevel: "Serializable",
            },
          );
        }
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          await reply.code(200).send({
            received: true,
          });
          return;
        }

        throw error;
      }

      await reply.code(200).send({
        received: true,
      });
    },
  );
}
