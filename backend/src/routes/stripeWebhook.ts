import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Stripe from "stripe";

import { prisma } from "../db";

const DEPOSIT_WALLET_CURRENCY = "AED";
const DEPOSIT_TOPUP_PURPOSE = "deposit_topup";

type StripeWebhookRequest = FastifyRequest<{
  Body: Buffer | string;
}>;

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

async function markWebhookEvent(
  tx: {
    paymentWebhookEvent: {
      update: (input: {
        where: { stripeEventId: string };
        data: {
          status: "PROCESSED" | "IGNORED" | "FAILED";
          processedAt: Date;
        };
      }) => Promise<unknown>;
    };
  },
  stripeEventId: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
): Promise<void> {
  await tx.paymentWebhookEvent.update({
    where: {
      stripeEventId,
    },
    data: {
      status,
      processedAt: new Date(),
    },
  });
}

async function handlePaymentIntentSucceeded(
  tx: {
    paymentWebhookEvent: {
      update: (input: {
        where: { stripeEventId: string };
        data: {
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
    $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  },
  stripeEventId: string,
  paymentIntent: Stripe.PaymentIntent,
  reply: FastifyReply,
): Promise<void> {
  const purpose = paymentIntent.metadata?.purpose?.trim();

  if (purpose !== DEPOSIT_TOPUP_PURPOSE) {
    await markWebhookEvent(tx, stripeEventId, "IGNORED");
    return;
  }

  const companyId = paymentIntent.metadata?.companyId?.trim();
  const amountInFils = getSucceededAmountInFils(paymentIntent);

  if (!companyId || !amountInFils) {
    reply.log.error(
      {
        stripeEventId,
        paymentIntentId: paymentIntent.id,
        companyId,
        amountInFils,
      },
      "Stripe deposit top-up metadata was invalid",
    );

    await markWebhookEvent(tx, stripeEventId, "FAILED");
    return;
  }

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
        increment: formatFilsAsAed(amountInFils),
      },
    },
  });

  await markWebhookEvent(tx, stripeEventId, "PROCESSED");
}

async function handlePaymentIntentFailed(
  tx: {
    paymentWebhookEvent: {
      update: (input: {
        where: { stripeEventId: string };
        data: {
          status: "PROCESSED" | "IGNORED" | "FAILED";
          processedAt: Date;
        };
      }) => Promise<unknown>;
    };
  },
  stripeEventId: string,
  paymentIntent: Stripe.PaymentIntent,
  reply: FastifyReply,
): Promise<void> {
  reply.log.warn(
    {
      stripeEventId,
      paymentIntentId: paymentIntent.id,
      companyId: paymentIntent.metadata?.companyId?.trim() || null,
      failureCode: paymentIntent.last_payment_error?.code || null,
      failureMessage: paymentIntent.last_payment_error?.message || null,
    },
    "Stripe deposit top-up payment failed",
  );

  await markWebhookEvent(tx, stripeEventId, "PROCESSED");
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

      if (!signature) {
        await reply.code(400).send({
          error: "invalid_signature",
        });
        return;
      }

      const rawBody = getRawBodyBuffer(request.body);
      let event: Stripe.Event;

      try {
        const { stripe } = await import("../lib/stripe");

        event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
      } catch (error) {
        request.log.warn({ err: error }, "Stripe webhook signature verification failed");
        await reply.code(400).send({
          error: "invalid_signature",
        });
        return;
      }

      const payloadHash = hashPayload(rawBody);

      try {
        await prisma.$transaction(async (tx) => {
          await tx.paymentWebhookEvent.create({
            data: {
              stripeEventId: event.id,
              eventType: event.type,
              payloadHash,
            },
          });

          switch (event.type) {
            case "payment_intent.succeeded":
              await handlePaymentIntentSucceeded(
                tx,
                event.id,
                event.data.object as Stripe.PaymentIntent,
                reply,
              );
              return;

            case "payment_intent.payment_failed":
              await handlePaymentIntentFailed(
                tx,
                event.id,
                event.data.object as Stripe.PaymentIntent,
                reply,
              );
              return;

            default:
              await markWebhookEvent(tx, event.id, "IGNORED");
          }
        });
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
