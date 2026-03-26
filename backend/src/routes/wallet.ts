import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import { loadBuyerAccessContext, requireActiveBuyerAccount, requireAuth } from "../lib/auth";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
      toString?: () => string;
    };

type IdempotencyResponseBody = Record<string, unknown>;

type WalletLockRow = {
  id: string;
  user_id: string;
  balance: DecimalLike;
  locked_balance: DecimalLike;
};

type PendingWithdrawalRow = {
  amount: DecimalLike;
};

const walletQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const depositSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  idempotencyKey: z.string().trim().min(1),
});

const topupSchema = z.object({
  amount: z.coerce.number().finite().positive().min(5000),
});

const withdrawSchema = z.object({
  amount: z.coerce.number().finite().positive(),
});

const invoiceParamsSchema = z.object({
  invoiceId: z.string().trim().min(1),
});

const emptyBodySchema = z.object({}).passthrough();

const DEPOSIT_WALLET_CURRENCY = "AED";
const DEPOSIT_TOPUP_PURPOSE = "deposit_topup";

async function toNumberValue(value: DecimalLike): Promise<number> {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (value && typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unable to convert value to number");
}

async function normalizeMoney(value: number): Promise<number> {
  return Number(value.toFixed(2));
}

function formatDecimalString(rawValue: string): string {
  const trimmedValue = rawValue.trim();

  if (!/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
    throw new Error("Unable to format decimal value");
  }

  const isNegative = trimmedValue.startsWith("-");
  const unsignedValue = isNegative ? trimmedValue.slice(1) : trimmedValue;
  const [wholePartRaw, fractionalPartRaw = ""] = unsignedValue.split(".");
  const normalizedWholePart = wholePartRaw.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFractionalPart = fractionalPartRaw.padEnd(2, "0").slice(0, 2);

  return `${isNegative ? "-" : ""}${normalizedWholePart}.${normalizedFractionalPart}`;
}

async function toDecimalStringValue(value: DecimalLike): Promise<string> {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Unable to convert value to decimal string");
    }

    return formatDecimalString(value.toFixed(2));
  }

  if (typeof value === "bigint") {
    return `${value.toString()}.00`;
  }

  if (typeof value === "string") {
    return formatDecimalString(value);
  }

  if (value && typeof value === "object" && typeof value.toString === "function") {
    return formatDecimalString(value.toString());
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return formatDecimalString(rawValue.toFixed(2));
    }

    if (typeof rawValue === "string") {
      return formatDecimalString(rawValue);
    }
  }

  throw new Error("Unable to convert value to decimal string");
}

function buildLotTitle(
  brand: string | null | undefined,
  model: string | null | undefined,
  fallbackId: string,
): string {
  const parts = [brand?.trim(), model?.trim()].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return `Lot ${fallbackId.slice(0, 8).toUpperCase()}`;
}

function buildLotNumber(lotId: string): string {
  return `Lot ${lotId.slice(0, 8).toUpperCase()}`;
}

async function createRequestHash(payload: unknown): Promise<string> {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function mapZodIssues(
  issues: Array<{
    path: PropertyKey[];
    message: string;
  }>,
): Promise<Array<{ path: string; message: string }>> {
  return issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join("."),
    message: issue.message,
  }));
}

async function sendValidationError(
  reply: FastifyReply,
  issues: Array<{ path: string; message: string }>,
): Promise<void> {
  await reply.code(400).send({
    error: "INVALID_REQUEST",
    issues,
  });
}

async function ensureWalletForUser(
  tx: {
    user: {
      findUnique: (input: {
        where: {
          id: string;
        };
        select: {
          id: true;
        };
      }) => Promise<{ id: string } | null>;
    };
    wallet: {
      upsert: (input: {
        where: {
          userId: string;
        };
        update: {};
        create: {
          userId: string;
        };
        select: {
          id: true;
          userId: true;
          balance: true;
          lockedBalance: true;
        };
      }) => Promise<{
        id: string;
        userId: string;
        balance: DecimalLike;
        lockedBalance: DecimalLike;
      }>;
    };
  },
  userId: string,
): Promise<{
  id: string;
  userId: string;
  balance: DecimalLike;
  lockedBalance: DecimalLike;
} | null> {
  const user = await tx.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    return null;
  }

  return tx.wallet.upsert({
    where: {
      userId,
    },
    update: {},
    create: {
      userId,
    },
    select: {
      id: true,
      userId: true,
      balance: true,
      lockedBalance: true,
    },
  });
}

async function getAuthenticatedUserId(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const userId = request.auth?.userId;

  if (!userId) {
    await reply.code(401).send({
      error: "Unauthorized",
    });
    return null;
  }

  return userId;
}

async function loadBuyerContextOrReply(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Awaited<ReturnType<typeof loadBuyerAccessContext>>> {
  const buyerContext = await loadBuyerAccessContext(request);

  if (!buyerContext) {
    await reply.code(401).send({
      error: "Unauthorized",
    });
    return null;
  }

  return buyerContext;
}

async function getIdempotencyExpiry(): Promise<Date> {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

async function getRequiredIdempotencyKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();

  if (!idempotencyKey) {
    await reply.code(400).send({
      error: "MISSING_IDEMPOTENCY_KEY",
    });
    return null;
  }

  return idempotencyKey;
}

function convertAedAmountToFils(amount: number): number {
  const normalizedAmount = amount.toFixed(2);
  const [wholePart, fractionalPart = "00"] = normalizedAmount.split(".");

  return Number.parseInt(`${wholePart}${fractionalPart.padEnd(2, "0").slice(0, 2)}`, 10);
}

async function readStoredIdempotencyBody(value: string | null): Promise<IdempotencyResponseBody | null> {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as IdempotencyResponseBody;
    }

    return null;
  } catch {
    return null;
  }
}

async function processWalletDeposit(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply,
  endpoint: "/wallet/deposit" | "/wallet/topup",
): Promise<void> {
  await requireAuth(request, reply);

  if (reply.sent) {
    return;
  }

  const buyerAccess = await requireActiveBuyerAccount(request, reply);

  if (!buyerAccess) {
    return;
  }

  if (buyerAccess.kycVerified !== true) {
    await reply.code(403).send({
      error: "KYC_PENDING",
      message: "Your account is under review.",
    });
    return;
  }

  const { userId } = buyerAccess;
  const parsedBody = depositSchema.safeParse(request.body);

  if (!parsedBody.success) {
    await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
    return;
  }

  const normalizedAmount = await normalizeMoney(parsedBody.data.amount);
  const requestHash = await createRequestHash({
    amount: normalizedAmount,
  });

  try {
    const replay = await resolveExistingIdempotentResponse({
      actorId: userId,
      endpoint,
      idempotencyKey: parsedBody.data.idempotencyKey,
      requestHash,
    });

    if (replay) {
      await reply.code(replay.statusCode).send(replay.body);
      return;
    }

    await createPendingIdempotencyKey({
      actorId: userId,
      endpoint,
      idempotencyKey: parsedBody.data.idempotencyKey,
      requestHash,
    });

    const result = await prisma.$transaction(
      async (tx) => {
        const wallet = await ensureWalletForUser(tx, userId);

        if (!wallet) {
          return null;
        }

        const updatedWallet = await tx.wallet.update({
          where: {
            id: wallet.id,
          },
          data: {
            balance: {
              increment: normalizedAmount,
            },
          },
          select: {
            id: true,
            userId: true,
            balance: true,
            lockedBalance: true,
          },
        });

        const ledger = await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "DEPOSIT_TOPUP",
            amount: normalizedAmount,
            reference: parsedBody.data.idempotencyKey,
          },
          select: {
            id: true,
          },
        });

        return {
          wallet: updatedWallet,
          ledgerId: ledger.id,
        };
      },
      {
        isolationLevel: "Serializable",
      },
    );

    if (!result) {
      const body = {
        error: "WALLET_USER_NOT_FOUND",
      };

      await failIdempotencyKey({
        actorId: userId,
        endpoint,
        idempotencyKey: parsedBody.data.idempotencyKey,
        responseStatus: 404,
        responseBody: body,
      });

      await reply.code(404).send(body);
      return;
    }

    const balance = await toNumberValue(result.wallet.balance);
    const lockedBalance = await toNumberValue(result.wallet.lockedBalance);
    const responseBody = {
      result: "accepted",
      wallet_id: result.wallet.id,
      user_id: result.wallet.userId,
      amount: normalizedAmount,
      balance,
      available_balance: await normalizeMoney(balance - lockedBalance),
      ledger_id: result.ledgerId,
    };

    await completeIdempotencyKey({
      actorId: userId,
      endpoint,
      idempotencyKey: parsedBody.data.idempotencyKey,
      responseStatus: 200,
      responseBody,
    });

    await reply.code(200).send(responseBody);
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_IN_PROGRESS") {
      await reply.code(409).send({
        error: "REQUEST_IN_PROGRESS",
      });
      return;
    }

    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD") {
      await reply.code(409).send({
        error: "IDEMPOTENCY_CONFLICT",
      });
      return;
    }

    throw error;
  }
}

async function resolveExistingIdempotentResponse(input: {
  actorId: string;
  endpoint: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<{
  statusCode: number;
  body: IdempotencyResponseBody;
} | null> {
  const existing = await prisma.idempotencyKey.findFirst({
    where: {
      actorId: input.actorId,
      endpoint: input.endpoint,
      idempotencyKey: input.idempotencyKey,
    },
    select: {
      requestHash: true,
      status: true,
      responseStatus: true,
      responseBody: true,
    },
  });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== input.requestHash) {
    throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
  }

  if (existing.status === "COMPLETED" && existing.responseStatus) {
    const body = await readStoredIdempotencyBody(existing.responseBody ?? null);

    if (body) {
      return {
        statusCode: existing.responseStatus,
        body,
      };
    }
  }

  if (existing.status === "PENDING") {
    throw new Error("IDEMPOTENCY_KEY_IN_PROGRESS");
  }

  return null;
}

async function createPendingIdempotencyKey(input: {
  actorId: string;
  endpoint: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<void> {
  await prisma.idempotencyKey.create({
    data: {
      actorId: input.actorId,
      endpoint: input.endpoint,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      status: "PENDING",
      expiresAt: await getIdempotencyExpiry(),
    },
  });
}

async function completeIdempotencyKey(input: {
  actorId: string;
  endpoint: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: IdempotencyResponseBody;
}): Promise<void> {
  await prisma.idempotencyKey.updateMany({
    where: {
      actorId: input.actorId,
      endpoint: input.endpoint,
      idempotencyKey: input.idempotencyKey,
    },
    data: {
      status: "COMPLETED",
      responseStatus: input.responseStatus,
      responseBody: JSON.stringify(input.responseBody),
    },
  });
}

async function failIdempotencyKey(input: {
  actorId: string;
  endpoint: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: IdempotencyResponseBody;
}): Promise<void> {
  await prisma.idempotencyKey.updateMany({
    where: {
      actorId: input.actorId,
      endpoint: input.endpoint,
      idempotencyKey: input.idempotencyKey,
    },
    data: {
      status: "FAILED",
      responseStatus: input.responseStatus,
      responseBody: JSON.stringify(input.responseBody),
    },
  });
}

async function ensureInvoiceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  invoice: {
    buyerCompanyId: string;
    sellerCompanyId: string;
  },
): Promise<boolean> {
  if (request.auth?.role === "ADMIN") {
    return true;
  }

  const companyId = request.auth?.companyId;

  if (!companyId || (companyId !== invoice.buyerCompanyId && companyId !== invoice.sellerCompanyId)) {
    await reply.code(403).send({
      error: "FORBIDDEN",
    });
    return false;
  }

  return true;
}

async function createStripeIntent(input: {
  amount: number;
  currency: string;
  invoiceId: string;
  idempotencyKey: string;
  paymentId: string;
}): Promise<{
  stripePaymentIntentId: string;
  clientSecret: string | null;
  mock: boolean;
}> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const stripeApiBaseUrl = process.env.STRIPE_API_BASE_URL?.trim() || "https://api.stripe.com/v1";

  if (!stripeSecretKey) {
    return {
      stripePaymentIntentId: `pi_mock_${input.paymentId.replace(/-/g, "")}`,
      clientSecret: `pi_mock_secret_${input.paymentId.replace(/-/g, "")}`,
      mock: true,
    };
  }

  const body = new URLSearchParams();

  body.set("amount", String(Math.round(input.amount * 100)));
  body.set("currency", input.currency.toLowerCase());
  body.set("metadata[invoice_id]", input.invoiceId);
  body.set("automatic_payment_methods[enabled]", "true");

  const response = await fetch(`${stripeApiBaseUrl}/payment_intents`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": input.idempotencyKey,
    },
    body,
  });

  const rawPayload = await response.text();
  let parsedPayload: Record<string, unknown>;

  try {
    parsedPayload = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    parsedPayload = {};
  }

  if (!response.ok) {
    const stripeMessage =
      typeof parsedPayload.error === "object" &&
      parsedPayload.error &&
      "message" in parsedPayload.error &&
      typeof (parsedPayload.error as { message?: unknown }).message === "string"
        ? (parsedPayload.error as { message: string }).message
        : `Stripe API request failed with status ${response.status}`;

    throw new Error(stripeMessage);
  }

  const stripePaymentIntentId =
    typeof parsedPayload.id === "string" ? parsedPayload.id : null;

  if (!stripePaymentIntentId) {
    throw new Error("Stripe response did not include payment intent id");
  }

  return {
    stripePaymentIntentId,
    clientSecret:
      typeof parsedPayload.client_secret === "string" ? parsedPayload.client_secret : null,
    mock: false,
  };
}

export async function walletRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireAuth);

  fastify.get<{ Querystring: { limit?: string } }>(
    "/wallet",
    async function getWalletHandler(
      request: FastifyRequest<{ Querystring: { limit?: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const buyerContext = await loadBuyerContextOrReply(request, reply);

      if (!buyerContext) {
        return;
      }

      const wallet = await prisma.depositWallet.findUnique({
        where: {
          companyId_currency: {
            companyId: buyerContext.companyId,
            currency: DEPOSIT_WALLET_CURRENCY,
          },
        },
        select: {
          availableBalance: true,
          lockedBalance: true,
          pendingWithdrawalBalance: true,
          currency: true,
        },
      });

      await reply.code(200).send({
        availableBalance: wallet
          ? await toDecimalStringValue(wallet.availableBalance)
          : "0.00",
        lockedBalance: wallet ? await toDecimalStringValue(wallet.lockedBalance) : "0.00",
        pendingWithdrawalBalance: wallet
          ? await toDecimalStringValue(wallet.pendingWithdrawalBalance)
          : "0.00",
        currency: wallet?.currency ?? DEPOSIT_WALLET_CURRENCY,
      });
    },
  );

  fastify.post<{ Body: unknown }>(
    "/wallet/deposit",
    async function depositWalletHandler(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      await processWalletDeposit(request, reply, "/wallet/deposit");
    },
  );

  fastify.post<{ Body: unknown }>(
    "/wallet/topup",
    async function topupWalletHandler(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const buyerAccess = await requireActiveBuyerAccount(request, reply);

      if (!buyerAccess) {
        return;
      }

      if (buyerAccess.kycVerified !== true) {
        await reply.code(403).send({
          error: "KYC_PENDING",
          message: "Your account is under review.",
        });
        return;
      }

      const parsedBody = topupSchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const idempotencyKey = await getRequiredIdempotencyKey(request, reply);

      if (!idempotencyKey) {
        return;
      }

      try {
        const { stripe } = await import("../lib/stripe");
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: convertAedAmountToFils(parsedBody.data.amount),
            currency: DEPOSIT_WALLET_CURRENCY.toLowerCase(),
            metadata: {
              companyId: buyerAccess.companyId,
              userId: buyerAccess.userId,
              purpose: DEPOSIT_TOPUP_PURPOSE,
            },
            automatic_payment_methods: {
              enabled: true,
            },
          },
          {
            idempotencyKey,
          },
        );

        if (!paymentIntent.client_secret) {
          request.log.error(
            {
              paymentIntentId: paymentIntent.id,
              companyId: buyerAccess.companyId,
              userId: buyerAccess.userId,
            },
            "Stripe payment intent did not include a client secret",
          );
          await reply.code(502).send({
            error: "payment_provider_error",
          });
          return;
        }

        await reply.code(200).send({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      } catch (error) {
        request.log.error(
          {
            err: error,
            companyId: buyerAccess.companyId,
            userId: buyerAccess.userId,
          },
          "Stripe payment intent creation failed",
        );
        await reply.code(502).send({
          error: "payment_provider_error",
        });
      }
    },
  );

  fastify.post<{ Body: unknown }>(
    "/wallet/withdraw",
    async function withdrawWalletHandler(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const userId = await getAuthenticatedUserId(request, reply);

      if (!userId) {
        return;
      }

      const parsedBody = withdrawSchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const normalizedAmount = await normalizeMoney(parsedBody.data.amount);
      const result = await prisma.$transaction(
        async (tx) => {
          const wallet = await ensureWalletForUser(tx, userId);

          if (!wallet) {
            return {
              kind: "missing-user",
            } as const;
          }

          const lockedWalletRows = await tx.$queryRaw<WalletLockRow[]>`
            SELECT id, "userId" AS user_id, balance, "lockedBalance" AS locked_balance
            FROM "Wallet"
            WHERE id = ${wallet.id}
            FOR UPDATE
          `;
          const lockedWallet = lockedWalletRows[0];

          if (!lockedWallet) {
            return {
              kind: "missing-wallet",
            } as const;
          }

          const balance = await toNumberValue(lockedWallet.balance);
          const lockedBalance = await toNumberValue(lockedWallet.locked_balance);
          const availableBalance = await normalizeMoney(balance - lockedBalance);

          if (availableBalance < normalizedAmount) {
            return {
              kind: "insufficient-balance",
              availableBalance,
            } as const;
          }

          const updatedWallet = await tx.wallet.update({
            where: {
              id: wallet.id,
            },
            data: {
              balance: {
                decrement: normalizedAmount,
              },
            },
            select: {
              id: true,
              userId: true,
              balance: true,
              lockedBalance: true,
            },
          });

          const ledger = await tx.walletLedger.create({
            data: {
              walletId: wallet.id,
              type: "WITHDRAWAL",
              amount: normalizedAmount,
            },
            select: {
              id: true,
            },
          });

          return {
            kind: "ok",
            wallet: updatedWallet,
            ledgerId: ledger.id,
          } as const;
        },
        {
          isolationLevel: "Serializable",
        },
      );

      if (result.kind === "missing-user") {
        await reply.code(404).send({
          error: "WALLET_USER_NOT_FOUND",
        });
        return;
      }

      if (result.kind === "missing-wallet" || result.kind === "insufficient-balance") {
        await reply.code(409).send({
          error: "WALLET_INSUFFICIENT_BALANCE",
          availableBalance:
            result.kind === "insufficient-balance" ? result.availableBalance : 0,
        });
        return;
      }

      const balance = await toNumberValue(result.wallet.balance);
      const lockedBalance = await toNumberValue(result.wallet.lockedBalance);

      await reply.code(200).send({
        result: "accepted",
        wallet_id: result.wallet.id,
        user_id: result.wallet.userId,
        amount: normalizedAmount,
        balance,
        available_balance: await normalizeMoney(balance - lockedBalance),
        ledger_id: result.ledgerId,
      });
    },
  );

  fastify.get<{ Params: { invoiceId: string } }>(
    "/payments/invoices/:invoiceId",
    async function getInvoiceHandler(
      request: FastifyRequest<{ Params: { invoiceId: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = invoiceParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const invoice = await prisma.invoice.findUnique({
        where: {
          id: parsedParams.data.invoiceId,
        },
        include: {
          auction: {
            select: {
              id: true,
              state: true,
              vehicleId: true,
              sellerCompanyId: true,
              winnerCompanyId: true,
              currentPrice: true,
            },
          },
          payments: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
            select: {
              id: true,
              status: true,
              amount: true,
              currency: true,
              stripePaymentIntentId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!invoice) {
        await reply.code(404).send({
          error: "INVOICE_NOT_FOUND",
        });
        return;
      }

      const allowed = await ensureInvoiceAccess(request, reply, invoice);

      if (!allowed) {
        return;
      }

      const paymentDeadline = await prisma.paymentDeadline.findFirst({
        where: {
          auctionId: invoice.auctionId,
          buyerCompanyId: invoice.buyerCompanyId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          dueAt: true,
          status: true,
          escalatedFlag: true,
          resolvedAt: true,
        },
      });

      await reply.code(200).send({
        invoice: {
          id: invoice.id,
          auctionId: invoice.auctionId,
          buyerCompanyId: invoice.buyerCompanyId,
          sellerCompanyId: invoice.sellerCompanyId,
          subtotal: await toNumberValue(invoice.subtotal),
          commission: await toNumberValue(invoice.commission),
          vat: await toNumberValue(invoice.vat),
          total: await toNumberValue(invoice.total),
          currency: invoice.currency,
          status: invoice.status,
          issuedAt: invoice.issuedAt.toISOString(),
          dueAt: invoice.dueAt.toISOString(),
          paidAt: invoice.paidAt?.toISOString() ?? null,
          auction: {
            id: invoice.auction.id,
            state: invoice.auction.state,
            vehicleId: invoice.auction.vehicleId,
            sellerCompanyId: invoice.auction.sellerCompanyId,
            winnerCompanyId: invoice.auction.winnerCompanyId,
            currentPrice: await toNumberValue(invoice.auction.currentPrice),
          },
        },
        paymentDeadline: paymentDeadline
          ? {
              id: paymentDeadline.id,
              dueAt: paymentDeadline.dueAt.toISOString(),
              status: paymentDeadline.status,
              escalatedFlag: paymentDeadline.escalatedFlag,
              resolvedAt: paymentDeadline.resolvedAt?.toISOString() ?? null,
            }
          : null,
        payments: await Promise.all(
          invoice.payments.map(async (payment) => ({
            id: payment.id,
            status: payment.status,
            amount: await toNumberValue(payment.amount),
            currency: payment.currency,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            createdAt: payment.createdAt.toISOString(),
            updatedAt: payment.updatedAt.toISOString(),
          })),
        ),
      });
    },
  );

  fastify.post<{ Params: { invoiceId: string }; Body: unknown }>(
    "/payments/invoices/:invoiceId/intent",
    async function createInvoiceIntentHandler(
      request: FastifyRequest<{ Params: { invoiceId: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = invoiceParamsSchema.safeParse(request.params);
      const parsedBody = emptyBodySchema.safeParse(request.body ?? {});

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();

      if (!idempotencyKey) {
        await reply.code(400).send({
          error: "MISSING_IDEMPOTENCY_KEY",
          message: "Idempotency-Key header is required",
        });
        return;
      }

      const invoice = await prisma.invoice.findUnique({
        where: {
          id: parsedParams.data.invoiceId,
        },
        select: {
          id: true,
          auctionId: true,
          buyerCompanyId: true,
          sellerCompanyId: true,
          total: true,
          currency: true,
          status: true,
        },
      });

      if (!invoice) {
        await reply.code(404).send({
          error: "INVOICE_NOT_FOUND",
        });
        return;
      }

      const allowed = await ensureInvoiceAccess(request, reply, invoice);

      if (!allowed) {
        return;
      }

      if (request.auth?.role !== "ADMIN" && request.auth?.companyId !== invoice.buyerCompanyId) {
        await reply.code(403).send({
          error: "FORBIDDEN",
        });
        return;
      }

      if (invoice.status !== "ISSUED") {
        await reply.code(409).send({
          error: "INVOICE_NOT_ISSUED",
        });
        return;
      }

      const prepared = await prisma.$transaction(
        async (tx) => {
          const lockedInvoice = await tx.invoice.findUnique({
            where: {
              id: invoice.id,
            },
            select: {
              id: true,
              total: true,
              currency: true,
              status: true,
            },
          });

          if (!lockedInvoice) {
            return null;
          }

          const existingPayment = await tx.payment.findFirst({
            where: {
              invoiceId: invoice.id,
              idempotencyKey,
            },
            select: {
              id: true,
              amount: true,
              currency: true,
              stripePaymentIntentId: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          });

          if (existingPayment) {
            return {
              invoiceId: invoice.id,
              paymentId: existingPayment.id,
              amount: await toNumberValue(existingPayment.amount),
              currency: existingPayment.currency,
              stripePaymentIntentId: existingPayment.stripePaymentIntentId,
              replayed: existingPayment.stripePaymentIntentId !== null,
            };
          }

          const payment = await tx.payment.create({
            data: {
              invoiceId: invoice.id,
              idempotencyKey,
              amount: await toNumberValue(lockedInvoice.total),
              currency: lockedInvoice.currency,
            },
            select: {
              id: true,
              amount: true,
              currency: true,
            },
          });

          return {
            invoiceId: invoice.id,
            paymentId: payment.id,
            amount: await toNumberValue(payment.amount),
            currency: payment.currency,
            stripePaymentIntentId: null,
            replayed: false,
          };
        },
        {
          isolationLevel: "Serializable",
        },
      );

      if (!prepared) {
        await reply.code(404).send({
          error: "INVOICE_NOT_FOUND",
        });
        return;
      }

      if (prepared.stripePaymentIntentId) {
        await reply.code(200).send({
          result: "accepted",
          replayed: true,
          invoice_id: prepared.invoiceId,
          payment_id: prepared.paymentId,
          stripe_payment_intent_id: prepared.stripePaymentIntentId,
          clientSecret: null,
          client_secret: null,
          amount: prepared.amount,
          currency: prepared.currency,
        });
        return;
      }

      try {
        const stripeIntent = await createStripeIntent({
          amount: prepared.amount,
          currency: prepared.currency,
          invoiceId: prepared.invoiceId,
          idempotencyKey,
          paymentId: prepared.paymentId,
        });

        const attachedPayment = await prisma.$transaction(
          async (tx) => {
            const payment = await tx.payment.findUnique({
              where: {
                id: prepared.paymentId,
              },
              select: {
                id: true,
                invoiceId: true,
                amount: true,
                currency: true,
                stripePaymentIntentId: true,
              },
            });

            if (!payment) {
              return null;
            }

            if (payment.stripePaymentIntentId) {
              return {
                paymentId: payment.id,
                invoiceId: payment.invoiceId,
                amount: await toNumberValue(payment.amount),
                currency: payment.currency,
                stripePaymentIntentId: payment.stripePaymentIntentId,
                replayed: true,
                clientSecret: null,
              };
            }

            const updatedPayment = await tx.payment.update({
              where: {
                id: prepared.paymentId,
              },
              data: {
                stripePaymentIntentId: stripeIntent.stripePaymentIntentId,
                lastEventAt: new Date(),
              },
              select: {
                id: true,
                invoiceId: true,
                amount: true,
                currency: true,
                stripePaymentIntentId: true,
              },
            });

            return {
              paymentId: updatedPayment.id,
              invoiceId: updatedPayment.invoiceId,
              amount: await toNumberValue(updatedPayment.amount),
              currency: updatedPayment.currency,
              stripePaymentIntentId: updatedPayment.stripePaymentIntentId ?? stripeIntent.stripePaymentIntentId,
              replayed: false,
              clientSecret: stripeIntent.clientSecret,
            };
          },
          {
            isolationLevel: "Serializable",
          },
        );

        if (!attachedPayment) {
          await reply.code(404).send({
            error: "PAYMENT_NOT_FOUND",
          });
          return;
        }

        await reply.code(200).send({
          result: "accepted",
          replayed: attachedPayment.replayed,
          invoice_id: attachedPayment.invoiceId,
          payment_id: attachedPayment.paymentId,
          stripe_payment_intent_id: attachedPayment.stripePaymentIntentId,
          clientSecret: attachedPayment.clientSecret,
          client_secret: attachedPayment.clientSecret,
          amount: attachedPayment.amount,
          currency: attachedPayment.currency,
          mock: stripeIntent.mock,
        });
      } catch (error) {
        await reply.code(502).send({
          error: "STRIPE_PAYMENT_INTENT_FAILED",
          message: error instanceof Error ? error.message : "Stripe payment intent failed",
        });
      }
    },
  );
}
