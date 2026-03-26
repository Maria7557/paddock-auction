import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import { releaseAuctionDepositLocks } from "../lib/auction-deposit-locks";
import { requireAuth, requireSellerAuth } from "../lib/auth";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
    };

type IdempotencyResponseBody = Record<string, unknown>;
const DEFAULT_SELLER_AUCTION_MIN_INCREMENT = 500;
const PAYMENT_WINDOW_HOURS = 48;

type LockedAuctionDecisionRow = {
  id: string;
  state: string;
  seller_company_id: string;
  winner_company_id: string | null;
  current_price: DecimalLike;
  seller_decision: string | null;
};

type SellerDecisionSuccess = {
  auctionId: string;
  newStatus: "PAYMENT_PENDING" | "RELISTED";
  invoiceId: string | null;
};

type SellerDecisionResult =
  | {
      kind: "success";
      response: SellerDecisionSuccess;
    }
  | {
      kind: "error";
      statusCode: number;
      body: IdempotencyResponseBody;
    };

const sellerVehicleSchema = z.object({
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().int().min(1886).max(2100),
  mileage: z.coerce.number().int().nonnegative(),
  vin: z.string().trim().min(5).max(64),
  marketPrice: z.coerce.number().nonnegative().optional(),
  fuelType: z.string().trim().min(1).optional(),
  transmission: z.string().trim().min(1).optional(),
  bodyType: z.string().trim().min(1).optional(),
  regionSpec: z.string().trim().min(1).optional(),
  condition: z.string().trim().min(1).optional(),
  serviceHistory: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  engine: z.string().trim().min(1).optional(),
  driveType: z.string().trim().min(1).optional(),
  exteriorColor: z.string().trim().min(1).optional(),
  interiorColor: z.string().trim().min(1).optional(),
  airbags: z.string().trim().min(1).optional(),
  damage: z.string().trim().min(1).optional(),
  damageMap: z.record(z.string(), z.unknown()).nullable().optional(),
  images: z.array(z.string().trim().min(1)).default([]),
  mulkiyaFrontUrl: z.string().trim().min(1).optional(),
  mulkiyaBackUrl: z.string().trim().min(1).optional(),
  buyNowPrice: z.coerce.number().positive().optional(),
  inspectionDropoffDate: z.string().datetime().optional(),
});

const sellerVehicleUpdateSchema = sellerVehicleSchema.partial();

const sellerVehicleListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).optional(),
});

const sellerAuctionCreateSchema = z.object({
  vehicleId: z.string().trim().min(1),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  inspectionDropoffDate: z.string().datetime().optional(),
  viewingEndsAt: z.string().datetime().optional(),
  auctionStartsAt: z.string().datetime().optional(),
  auctionEndsAt: z.string().datetime().optional(),
  buyNowPrice: z.coerce.number().positive().optional(),
  minIncrement: z.coerce.number().positive().default(DEFAULT_SELLER_AUCTION_MIN_INCREMENT),
});

const sellerAuctionUpdateSchema = z.object({
  action: z.enum(["publish", "cancel", "update"]).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  inspectionDropoffDate: z.string().datetime().optional(),
  viewingEndsAt: z.string().datetime().optional(),
  auctionStartsAt: z.string().datetime().optional(),
  auctionEndsAt: z.string().datetime().optional(),
  buyNowPrice: z.coerce.number().positive().nullable().optional(),
  minIncrement: z.coerce.number().positive().optional(),
});

const sellerAuctionListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).optional(),
});

const auctionDecisionParamsSchema = z.object({
  auctionId: z.string().trim().min(1),
});

const sellerDecisionBodySchema = z.object({
  decision: z.enum(["accept", "decline"]),
});

const adminForceDecisionBodySchema = z.object({
  decision: z.enum(["accept", "decline"]),
  reason: z.string().trim().min(1),
});

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
    const resolved = value.valueOf();

    if (typeof resolved === "number" && Number.isFinite(resolved)) {
      return resolved;
    }

    if (typeof resolved === "string") {
      const parsed = Number(resolved);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  throw new Error("Unable to convert decimal value");
}

async function toIsoString(value: Date | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }

  return value.toISOString();
}

async function toDateValue(value: string | undefined, fallback: Date): Promise<Date> {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }

  return parsed;
}

async function normalizeVin(vin: string): Promise<string> {
  return vin.trim().toUpperCase();
}

async function normalizeMoney(value: number): Promise<number> {
  return Number(value.toFixed(2));
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

function buildBuyerAlias(companyId: string | null | undefined): string {
  const normalized = companyId?.trim();

  if (!normalized) {
    return "Buyer #UNKN";
  }

  return `Buyer #${normalized.slice(0, 4).toUpperCase()}`;
}

async function addHours(base: Date, hours: number): Promise<Date> {
  const next = new Date(base);

  next.setUTCHours(next.getUTCHours() + hours);

  return next;
}

async function toVehicleMediaCreateInput(input: {
  images: string[];
  mulkiyaFrontUrl?: string;
  mulkiyaBackUrl?: string;
}): Promise<Array<{ url: string; type: "PHOTO" | "MULKIYA_FRONT" | "MULKIYA_BACK"; sortOrder: number }>> {
  const items: Array<{ url: string; type: "PHOTO" | "MULKIYA_FRONT" | "MULKIYA_BACK"; sortOrder: number }> = [];

  for (const [index, url] of input.images.entries()) {
    items.push({
      url,
      type: "PHOTO",
      sortOrder: index,
    });
  }

  if (input.mulkiyaFrontUrl) {
    items.push({
      url: input.mulkiyaFrontUrl,
      type: "MULKIYA_FRONT",
      sortOrder: 0,
    });
  }

  if (input.mulkiyaBackUrl) {
    items.push({
      url: input.mulkiyaBackUrl,
      type: "MULKIYA_BACK",
      sortOrder: 0,
    });
  }

  return items;
}

async function readVehicleMediaUrls(input: {
  images: string[];
  media: Array<{
    url: string;
    type: string;
    sortOrder: number;
  }>;
}): Promise<{
  photoUrls: string[];
  mulkiyaFrontUrl: string | null;
  mulkiyaBackUrl: string | null;
}> {
  const photoUrls = input.media
    .filter((item) => item.type === "PHOTO")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => item.url);

  return {
    photoUrls: photoUrls.length > 0 ? photoUrls : input.images,
    mulkiyaFrontUrl: input.media.find((item) => item.type === "MULKIYA_FRONT")?.url ?? null,
    mulkiyaBackUrl: input.media.find((item) => item.type === "MULKIYA_BACK")?.url ?? null,
  };
}

async function createPayloadHash(payload: unknown): Promise<string> {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function toStoredJson(payload: unknown): Promise<Prisma.InputJsonValue> {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

async function getIdempotencyExpiry(): Promise<Date> {
  return addHours(new Date(), 24);
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

  if (existing.status !== "PENDING" && existing.responseStatus) {
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

async function createAuditLog(
  tx: {
    auditLog: {
      create: (input: {
        data: {
          actorId: string;
          action: string;
          entityType: string;
          entityId: string;
          payload: Prisma.InputJsonValue;
          payloadHash: string;
        };
      }) => Promise<unknown>;
    };
  },
  input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: await toStoredJson(input.payload),
      payloadHash: await createPayloadHash(input.payload),
    },
  });
}

async function applyAuctionDecisionInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    auctionId: string;
    decision: "accept" | "decline" | "expired";
    actorId: string | null;
    sellerCompanyId?: string;
    auditAction: string;
    trigger: string;
    reason?: string | null;
  },
): Promise<SellerDecisionResult> {
  const rows = await tx.$queryRaw<LockedAuctionDecisionRow[]>`
    SELECT
      id,
      state,
      seller_company_id,
      winner_company_id,
      current_price,
      seller_decision
    FROM auctions
    WHERE id = ${input.auctionId}
    FOR UPDATE
  `;
  const auction = rows[0];

  if (!auction) {
    return {
      kind: "error",
      statusCode: 404,
      body: {
        error: "AUCTION_NOT_FOUND",
      },
    };
  }

  if (input.sellerCompanyId && auction.seller_company_id !== input.sellerCompanyId) {
    return {
      kind: "error",
      statusCode: 403,
      body: {
        error: "FORBIDDEN",
      },
    };
  }

  if (auction.seller_decision !== null) {
    return {
      kind: "error",
      statusCode: 409,
      body: {
        error: "DECISION_ALREADY_MADE",
      },
    };
  }

  if (auction.state !== "AWAITING_SELLER_DECISION") {
    return {
      kind: "error",
      statusCode: 422,
      body: {
        error: "AUCTION_NOT_AWAITING_SELLER_DECISION",
      },
    };
  }

  const now = new Date();

  if (input.decision === "accept") {
    const winnerCompanyId = auction.winner_company_id?.trim() ?? null;

    if (!winnerCompanyId) {
      return {
        kind: "error",
        statusCode: 422,
        body: {
          error: "AUCTION_HAS_NO_WINNER",
        },
      };
    }

    const buyerCompany = await tx.company.findUnique({
      where: {
        id: winnerCompanyId,
      },
      select: {
        buyerTier: true,
      },
    });

    if (!buyerCompany) {
      throw new Error(`Winner company ${winnerCompanyId} not found`);
    }

    const subtotal = await toNumberValue(auction.current_price);
    const commissionRate = buyerCompany.buyerTier === "VIP" ? 0.04 : 0.02;
    const commission = await normalizeMoney(subtotal * commissionRate);
    const vat = await normalizeMoney((subtotal + commission) * 0.05);
    const total = await normalizeMoney(subtotal + commission + vat);
    const dueAt = await addHours(now, PAYMENT_WINDOW_HOURS);
    const invoice = await tx.invoice.create({
      data: {
        auctionId: auction.id,
        buyerCompanyId: winnerCompanyId,
        sellerCompanyId: auction.seller_company_id,
        subtotal,
        commission,
        vat,
        total,
        currency: "AED",
        status: "ISSUED",
        issuedAt: now,
        dueAt,
      },
      select: {
        id: true,
      },
    });

    await tx.paymentDeadline.create({
      data: {
        auctionId: auction.id,
        buyerCompanyId: winnerCompanyId,
        dueAt,
      },
    });

    await tx.auction.update({
      where: {
        id: auction.id,
      },
      data: {
        state: "PAYMENT_PENDING",
        sellerDecision: "accepted",
        sellerDecidedAt: now,
        sellerDecidedBy: input.actorId,
      },
    });

    await tx.auctionStateTransition.create({
      data: {
        auctionId: auction.id,
        fromState: "AWAITING_SELLER_DECISION",
        toState: "PAYMENT_PENDING",
        trigger: input.trigger,
        actorId: input.actorId,
        reason: JSON.stringify({
          decision: "accept",
          sellerCompanyId: auction.seller_company_id,
          buyerCompanyId: winnerCompanyId,
          invoiceId: invoice.id,
          forcedReason: input.reason ?? null,
        }),
      },
    });

    await createAuditLog(tx, {
      actorId: input.actorId ?? "system",
      action: input.auditAction,
      entityType: "Auction",
      entityId: auction.id,
      payload: {
        auctionId: auction.id,
        previousState: "AWAITING_SELLER_DECISION",
        nextState: "PAYMENT_PENDING",
        sellerCompanyId: auction.seller_company_id,
        buyerCompanyId: winnerCompanyId,
        invoiceId: invoice.id,
        decision: "accept",
        forcedReason: input.reason ?? null,
      },
    });

    return {
      kind: "success",
      response: {
        auctionId: auction.id,
        newStatus: "PAYMENT_PENDING",
        invoiceId: invoice.id,
      },
    };
  }

  await releaseAuctionDepositLocks(tx, {
    auctionId: auction.id,
    reason: input.decision === "decline" ? "SELLER_DECLINED" : "SELLER_DECISION_EXPIRED",
  });

  await tx.auction.update({
    where: {
      id: auction.id,
    },
    data: {
      state: "RELISTED",
      sellerDecision: input.decision === "decline" ? "declined" : "expired",
      sellerDecidedAt: now,
      sellerDecidedBy: input.actorId,
    },
  });

  await tx.auctionStateTransition.create({
    data: {
      auctionId: auction.id,
      fromState: "AWAITING_SELLER_DECISION",
      toState: "RELISTED",
      trigger: input.trigger,
      actorId: input.actorId,
      reason: JSON.stringify({
        decision: input.decision,
        sellerCompanyId: auction.seller_company_id,
        buyerCompanyId: auction.winner_company_id,
        forcedReason: input.reason ?? null,
      }),
    },
  });

  await createAuditLog(tx, {
    actorId: input.actorId ?? "system",
    action: input.auditAction,
    entityType: "Auction",
    entityId: auction.id,
    payload: {
      auctionId: auction.id,
      previousState: "AWAITING_SELLER_DECISION",
      nextState: "RELISTED",
      sellerCompanyId: auction.seller_company_id,
      buyerCompanyId: auction.winner_company_id,
      decision: input.decision,
      forcedReason: input.reason ?? null,
    },
  });

  return {
    kind: "success",
    response: {
      auctionId: auction.id,
      newStatus: "RELISTED",
      invoiceId: null,
    },
  };
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

async function matchesAuctionState(state: string, filter: string): Promise<boolean> {
  const normalized = filter.trim().toUpperCase();

  if (!normalized || normalized === "ALL") {
    return true;
  }

  if (normalized === "ENDED") {
    return ["ENDED", "CLOSED", "PAID", "PAYMENT_PENDING", "DEFAULTED", "CANCELED"].includes(state);
  }

  return state === normalized;
}

async function findSellerVehicle(
  companyId: string,
  vehicleId: string,
): Promise<{
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
  marketPrice: DecimalLike | null;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  regionSpec: string | null;
  condition: string | null;
  serviceHistory: string | null;
  description: string | null;
  engine: string | null;
  driveType: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  airbags: string | null;
  damage: string | null;
  damageMap: unknown;
  images: string[];
  media: Array<{
    url: string;
    type: string;
    sortOrder: number;
  }>;
  auctions: Array<{
    id: string;
    state: string;
    createdAt: Date;
    startsAt: Date;
    endsAt: Date;
    inspectionDropoffDate: Date | null;
    viewingEndsAt: Date | null;
    auctionStartsAt: Date | null;
    auctionEndsAt: Date | null;
    currentPrice: DecimalLike;
    startingPrice: DecimalLike;
    buyNowPrice: DecimalLike | null;
    minIncrement: DecimalLike;
    highestBidId: string | null;
  }>;
} | null> {
  return prisma.vehicle.findFirst({
    where: {
      id: vehicleId,
      auctions: {
        some: {
          sellerCompanyId: companyId,
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
      },
    },
    include: {
      media: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      auctions: {
        where: {
          sellerCompanyId: companyId,
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });
}

export async function sellerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { auctionId: string }; Body: unknown }>(
    "/admin/auctions/:auctionId/force-decision",
    {
      preHandler: requireAuth,
    },
    async function forceAdminAuctionDecisionHandler(
      request: FastifyRequest<{ Params: { auctionId: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const role = request.auth?.role;

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        await reply.code(403).send({ error: "Forbidden" });
        return;
      }

      const parsedParams = auctionDecisionParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const parsedBody = adminForceDecisionBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const result = await prisma.$transaction(
        (tx) =>
          applyAuctionDecisionInTransaction(tx, {
            auctionId: parsedParams.data.auctionId,
            decision: parsedBody.data.decision,
            actorId,
            auditAction:
              parsedBody.data.decision === "accept"
                ? "ADMIN_FORCE_DECISION_ACCEPTED"
                : "ADMIN_FORCE_DECISION_DECLINED",
            trigger: parsedBody.data.decision === "accept" ? "SELLER_ACCEPTED" : "SELLER_DECLINED",
            reason: parsedBody.data.reason,
          }),
        {
          isolationLevel: "Serializable",
        },
      );

      if (result.kind === "error") {
        await reply.code(result.statusCode).send(result.body);
        return;
      }

      await reply.code(200).send(result.response);
    },
  );

  fastify.addHook("preHandler", async function sellerAuthHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const rawUrl = request.raw.url ?? "";
    const routeUrl = request.routeOptions.url ?? "";

    if (rawUrl.startsWith("/api/admin/") || routeUrl.startsWith("/admin/")) {
      return;
    }

    await requireSellerAuth(request, reply);
  });

  fastify.get("/seller/dashboard", async function sellerDashboardHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const companyId = request.auth?.companyId;

    if (!companyId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const auctions = await prisma.auction.findMany({
      where: {
        sellerCompanyId: companyId,
        transitions: {
          none: {
            trigger: "EVENT_META",
          },
        },
      },
      select: {
        id: true,
        state: true,
        currentPrice: true,
        highestBidId: true,
        vehicleId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    let activeLots = 0;
    let completedLots = 0;
    let revenue = 0;
    const vehicleIds = new Set<string>();

    for (const auction of auctions) {
      vehicleIds.add(auction.vehicleId);

      if (["DRAFT", "SCHEDULED", "LIVE", "EXTENDED"].includes(auction.state)) {
        activeLots += 1;
      }

      if (["ENDED", "CLOSED", "PAYMENT_PENDING", "PAID", "DEFAULTED", "CANCELED"].includes(auction.state)) {
        completedLots += 1;
      }

      if (
        auction.highestBidId &&
        ["ENDED", "CLOSED", "PAYMENT_PENDING", "PAID", "DEFAULTED"].includes(auction.state)
      ) {
        revenue += await toNumberValue(auction.currentPrice);
      }
    }

    await reply.code(200).send({
      metrics: {
        totalVehicles: vehicleIds.size,
        activeLots,
        completedLots,
        revenue,
      },
      auctions: await Promise.all(
        auctions.slice(0, 10).map(async (auction) => ({
          id: auction.id,
          state: auction.state,
          currentPrice: await toNumberValue(auction.currentPrice),
          startsAt: auction.startsAt.toISOString(),
          endsAt: auction.endsAt.toISOString(),
        })),
      ),
    });
  });

  fastify.get("/seller/decisions/pending", async function getPendingSellerDecisionsHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const companyId = request.auth?.companyId;

    if (!companyId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const auctions = await prisma.auction.findMany({
      where: {
        sellerCompanyId: companyId,
        state: "AWAITING_SELLER_DECISION",
      },
      select: {
        id: true,
        currentPrice: true,
        decisionDeadlineAt: true,
        winnerCompanyId: true,
        vehicle: {
          select: {
            brand: true,
            model: true,
            images: true,
          },
        },
      },
      orderBy: [{ decisionDeadlineAt: "asc" }, { id: "asc" }],
    });

    const pending = [];

    for (const auction of auctions) {
      const decisionDeadlineIso = await toIsoString(auction.decisionDeadlineAt);

      if (!decisionDeadlineIso) {
        continue;
      }

      pending.push({
        auctionId: auction.id,
        lotTitle: buildLotTitle(auction.vehicle?.brand, auction.vehicle?.model, auction.id),
        imageUrl: auction.vehicle?.images[0] ?? null,
        winningBidAmount: await toNumberValue(auction.currentPrice),
        buyerAlias: buildBuyerAlias(auction.winnerCompanyId),
        decisionDeadlineIso,
        status: "AWAITING_SELLER_DECISION" as const,
      });
    }

    await reply.code(200).send({
      pending,
    });
  });

  fastify.post<{ Params: { auctionId: string }; Body: unknown }>(
    "/seller/auctions/:auctionId/decision",
    async function postSellerAuctionDecisionHandler(
      request: FastifyRequest<{ Params: { auctionId: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const companyId = request.auth?.companyId;

      if (!actorId || !companyId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      const parsedParams = auctionDecisionParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const parsedBody = sellerDecisionBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const idempotencyKey = await getRequiredIdempotencyKey(request, reply);

      if (!idempotencyKey) {
        return;
      }

      const endpoint = `/seller/auctions/${parsedParams.data.auctionId}/decision`;
      const requestHash = await createPayloadHash(parsedBody.data);

      try {
        const replay = await resolveExistingIdempotentResponse({
          actorId,
          endpoint,
          idempotencyKey,
          requestHash,
        });

        if (replay) {
          await reply.code(replay.statusCode).send(replay.body);
          return;
        }

        await createPendingIdempotencyKey({
          actorId,
          endpoint,
          idempotencyKey,
          requestHash,
        });

        const result = await prisma.$transaction(
          (tx) =>
            applyAuctionDecisionInTransaction(tx, {
              auctionId: parsedParams.data.auctionId,
              decision: parsedBody.data.decision,
              actorId,
              sellerCompanyId: companyId,
              auditAction:
                parsedBody.data.decision === "accept"
                  ? "SELLER_DECISION_ACCEPTED"
                  : "SELLER_DECISION_DECLINED",
              trigger: parsedBody.data.decision === "accept" ? "SELLER_ACCEPTED" : "SELLER_DECLINED",
            }),
          {
            isolationLevel: "Serializable",
          },
        );

        if (result.kind === "error") {
          await failIdempotencyKey({
            actorId,
            endpoint,
            idempotencyKey,
            responseStatus: result.statusCode,
            responseBody: result.body,
          });

          await reply.code(result.statusCode).send(result.body);
          return;
        }

        await completeIdempotencyKey({
          actorId,
          endpoint,
          idempotencyKey,
          responseStatus: 200,
          responseBody: result.response,
        });

        await reply.code(200).send(result.response);
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

        await failIdempotencyKey({
          actorId,
          endpoint,
          idempotencyKey,
          responseStatus: 500,
          responseBody: {
            error: "INTERNAL_SERVER_ERROR",
          },
        }).catch(() => undefined);

        throw error;
      }
    },
  );

  fastify.get<{ Querystring: { q?: string; status?: string; sort?: string } }>(
    "/seller/vehicles",
    async function sellerVehiclesHandler(
      request: FastifyRequest<{ Querystring: { q?: string; status?: string; sort?: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const companyId = request.auth?.companyId;

      if (!companyId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      const parsedQuery = sellerVehicleListQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(reply, await mapZodIssues(parsedQuery.error.issues));
        return;
      }

      const { q, sort, status } = parsedQuery.data;
      const vehicles = await prisma.vehicle.findMany({
        where: {
          auctions: {
            some: {
              sellerCompanyId: companyId,
              transitions: {
                none: {
                  trigger: "EVENT_META",
                },
              },
            },
          },
        },
        include: {
          auctions: {
            where: {
              sellerCompanyId: companyId,
              transitions: {
                none: {
                  trigger: "EVENT_META",
                },
              },
            },
            orderBy:
              sort === "oldest"
                ? [{ createdAt: "asc" }, { id: "asc" }]
                : sort === "price_asc"
                  ? [{ currentPrice: "asc" }, { id: "asc" }]
                  : sort === "price_desc"
                    ? [{ currentPrice: "desc" }, { id: "asc" }]
                    : [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              state: true,
              currentPrice: true,
              createdAt: true,
              startsAt: true,
              endsAt: true,
              decisionDeadlineAt: true,
            },
          },
        },
        orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
      });

      const filteredVehicles = [];

      for (const vehicle of vehicles) {
        const latestAuction = vehicle.auctions[0] ?? null;

        if (!latestAuction) {
          continue;
        }

        if (!(await matchesAuctionState(latestAuction.state, status ?? "ALL"))) {
          continue;
        }

        if (q) {
          const needle = q.toLowerCase();
          const haystack = `${vehicle.brand} ${vehicle.model} ${vehicle.vin}`.toLowerCase();

          if (!haystack.includes(needle)) {
            continue;
          }
        }

        filteredVehicles.push({
          id: vehicle.id,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          mileage: vehicle.mileage,
          mileageKm: vehicle.mileage,
          vin: vehicle.vin,
          images: vehicle.images,
          latestAuction: {
            id: latestAuction.id,
            state: latestAuction.state,
            currentPrice: await toNumberValue(latestAuction.currentPrice),
            currentBidAed: await toNumberValue(latestAuction.currentPrice),
            createdAt: latestAuction.createdAt.toISOString(),
            startsAt: latestAuction.startsAt.toISOString(),
            endsAt: latestAuction.endsAt.toISOString(),
            decisionDeadlineAt: latestAuction.decisionDeadlineAt?.toISOString() ?? null,
          },
        });
      }

      await reply.code(200).send({
        total: filteredVehicles.length,
        vehicles: filteredVehicles,
      });
    },
  );

  fastify.post<{ Body: unknown }>("/seller/vehicles", async function createSellerVehicleHandler(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.auth?.userId;
    const companyId = request.auth?.companyId;

    if (!actorId || !companyId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const parsedBody = sellerVehicleSchema.safeParse(request.body);

    if (!parsedBody.success) {
      await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
      return;
    }

    const payload = parsedBody.data;

    try {
      const now = new Date();
      const inspectionDropoffDate = payload.inspectionDropoffDate ? new Date(payload.inspectionDropoffDate) : null;
      const draftStartsAt = now;
      const draftEndsAt = new Date(draftStartsAt.getTime() + 24 * 60 * 60 * 1000);
      const mediaItems = await toVehicleMediaCreateInput({
        images: payload.images,
        mulkiyaFrontUrl: payload.mulkiyaFrontUrl,
        mulkiyaBackUrl: payload.mulkiyaBackUrl,
      });
      const createdVehicle = await prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            brand: payload.brand,
            model: payload.model,
            year: payload.year,
            mileage: payload.mileage,
            vin: await normalizeVin(payload.vin),
            marketPrice: payload.marketPrice ?? null,
            fuelType: payload.fuelType,
            transmission: payload.transmission,
            bodyType: payload.bodyType,
            regionSpec: payload.regionSpec,
            condition: payload.condition,
            serviceHistory: payload.serviceHistory,
            description: payload.description,
            engine: payload.engine,
            driveType: payload.driveType,
            exteriorColor: payload.exteriorColor,
            interiorColor: payload.interiorColor,
            airbags: payload.airbags,
            damage: payload.damage,
            damageMap:
              payload.damageMap === undefined ? undefined : await toStoredJson(payload.damageMap),
            images: payload.images,
            media:
              mediaItems.length > 0
                ? {
                    create: mediaItems,
                  }
                : undefined,
          },
        });

        const auction = await tx.auction.create({
          data: {
            vehicleId: vehicle.id,
            sellerCompanyId: companyId,
            state: "DRAFT",
            startsAt: draftStartsAt,
            endsAt: draftEndsAt,
            inspectionDropoffDate,
            viewingEndsAt: null,
            auctionStartsAt: null,
            auctionEndsAt: null,
            startingPrice: 0,
            currentPrice: 0,
            buyNowPrice: payload.buyNowPrice,
            minIncrement: DEFAULT_SELLER_AUCTION_MIN_INCREMENT,
          },
        });

        await tx.auctionStateTransition.create({
          data: {
            auctionId: auction.id,
            fromState: "DRAFT",
            toState: "DRAFT",
            trigger: "VEHICLE_CREATED",
            actorId,
            reason: JSON.stringify({
              sellerCompanyId: companyId,
              vehicleId: vehicle.id,
            }),
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "SELLER_VEHICLE_CREATED",
          entityType: "Vehicle",
          entityId: vehicle.id,
          payload: {
            companyId,
            vehicleId: vehicle.id,
            auctionId: auction.id,
            ...payload,
            vin: await normalizeVin(payload.vin),
          },
        });

        return {
          vehicle,
          auction,
        };
      });

      await reply.code(201).send({
        message: "Vehicle added and auction draft created",
        vehicle: {
          id: createdVehicle.vehicle.id,
          brand: createdVehicle.vehicle.brand,
          model: createdVehicle.vehicle.model,
          year: createdVehicle.vehicle.year,
          mileage: createdVehicle.vehicle.mileage,
          vin: createdVehicle.vehicle.vin,
          marketPrice:
            createdVehicle.vehicle.marketPrice === null
              ? null
              : await toNumberValue(createdVehicle.vehicle.marketPrice),
        },
        vehicleId: createdVehicle.vehicle.id,
        auctionId: createdVehicle.auction.id,
      });
    } catch (error) {
      const prismaError = error as { code?: string };

      if (prismaError.code === "P2002") {
        await reply.code(409).send({
          error: "VIN_ALREADY_EXISTS",
        });
        return;
      }

      throw error;
    }
  });

  fastify.get<{ Params: { id: string } }>("/seller/vehicles/:id", async function getSellerVehicleHandler(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const companyId = request.auth?.companyId;
    const { id } = request.params;

    if (!companyId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const vehicle = await findSellerVehicle(companyId, id);

    if (!vehicle) {
      await reply.code(404).send({
        error: "VEHICLE_NOT_FOUND",
      });
      return;
    }

    const latestAuction = vehicle.auctions[0] ?? null;
    const mediaUrls = await readVehicleMediaUrls({
      images: vehicle.images,
      media: vehicle.media ?? [],
    });

    await reply.code(200).send({
      vehicle: {
        id: vehicle.id,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        mileage: vehicle.mileage,
        mileageKm: vehicle.mileage,
        vin: vehicle.vin,
        marketPrice: vehicle.marketPrice === null ? null : await toNumberValue(vehicle.marketPrice),
        fuelType: vehicle.fuelType,
        transmission: vehicle.transmission,
        bodyType: vehicle.bodyType,
        regionSpec: vehicle.regionSpec,
        condition: vehicle.condition,
        serviceHistory: vehicle.serviceHistory,
        description: vehicle.description,
        engine: vehicle.engine,
        driveType: vehicle.driveType,
        exteriorColor: vehicle.exteriorColor,
        interiorColor: vehicle.interiorColor,
        airbags: vehicle.airbags,
        damage: vehicle.damage,
        damageMap: vehicle.damageMap,
        images: mediaUrls.photoUrls,
        photoUrls: mediaUrls.photoUrls,
        mulkiyaFrontUrl: mediaUrls.mulkiyaFrontUrl,
        mulkiyaBackUrl: mediaUrls.mulkiyaBackUrl,
      },
      latestAuction: latestAuction
        ? {
            id: latestAuction.id,
            state: latestAuction.state,
            currentPrice: await toNumberValue(latestAuction.currentPrice),
            startingPrice: await toNumberValue(latestAuction.startingPrice),
            buyNowPrice:
              latestAuction.buyNowPrice === null ? null : await toNumberValue(latestAuction.buyNowPrice),
            minIncrement: await toNumberValue(latestAuction.minIncrement),
            highestBidId: latestAuction.highestBidId,
            startsAt: latestAuction.startsAt.toISOString(),
            endsAt: latestAuction.endsAt.toISOString(),
            inspectionDropoffDate: await toIsoString(latestAuction.inspectionDropoffDate),
            viewingEndsAt: await toIsoString(latestAuction.viewingEndsAt),
            auctionStartsAt: await toIsoString(latestAuction.auctionStartsAt),
            auctionEndsAt: await toIsoString(latestAuction.auctionEndsAt),
          }
        : null,
    });
  });

  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    "/seller/vehicles/:id",
    async function updateSellerVehicleHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const companyId = request.auth?.companyId;
      const { id } = request.params;

      if (!actorId || !companyId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      const existingVehicle = await findSellerVehicle(companyId, id);

      if (!existingVehicle) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      const parsedBody = sellerVehicleUpdateSchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const payload = parsedBody.data;
      const latestAuction = existingVehicle.auctions[0] ?? null;

      if (!latestAuction || latestAuction.state !== "DRAFT") {
        await reply.code(409).send({
          error: "VEHICLE_EDIT_LOCKED",
          message: "Vehicle can only be edited while linked auction is DRAFT",
        });
        return;
      }

      try {
        const updatedVehicle = await prisma.$transaction(async (tx) => {
          const mediaItems = await toVehicleMediaCreateInput({
            images: payload.images ?? existingVehicle.images ?? [],
            mulkiyaFrontUrl: payload.mulkiyaFrontUrl,
            mulkiyaBackUrl: payload.mulkiyaBackUrl,
          });
          const vehicle = await tx.vehicle.update({
            where: {
              id,
            },
            data: {
              brand: payload.brand,
              model: payload.model,
              year: payload.year,
              mileage: payload.mileage,
              vin: payload.vin ? await normalizeVin(payload.vin) : undefined,
              marketPrice: payload.marketPrice === undefined ? undefined : payload.marketPrice,
              fuelType: payload.fuelType,
              transmission: payload.transmission,
              bodyType: payload.bodyType,
              regionSpec: payload.regionSpec,
              condition: payload.condition,
              serviceHistory: payload.serviceHistory,
              description: payload.description,
              engine: payload.engine,
              driveType: payload.driveType,
              exteriorColor: payload.exteriorColor,
              interiorColor: payload.interiorColor,
              airbags: payload.airbags,
              damage: payload.damage,
              damageMap:
                payload.damageMap === undefined ? undefined : await toStoredJson(payload.damageMap),
              images: payload.images,
              media:
                payload.images !== undefined ||
                payload.mulkiyaFrontUrl !== undefined ||
                payload.mulkiyaBackUrl !== undefined
                  ? {
                      deleteMany: {},
                      create: mediaItems,
                    }
                  : undefined,
            },
          });

          await createAuditLog(tx, {
            actorId,
            action: "SELLER_VEHICLE_UPDATED",
            entityType: "Vehicle",
            entityId: id,
            payload: {
              companyId,
              vehicleId: id,
              changes: payload,
            },
          });

          return vehicle;
        });

        await reply.code(200).send({
          vehicle: {
            id: updatedVehicle.id,
            brand: updatedVehicle.brand,
            model: updatedVehicle.model,
            year: updatedVehicle.year,
            mileage: updatedVehicle.mileage,
            vin: updatedVehicle.vin,
            marketPrice: updatedVehicle.marketPrice === null ? null : await toNumberValue(updatedVehicle.marketPrice),
          },
        });
      } catch (error) {
        const prismaError = error as { code?: string };

        if (prismaError.code === "P2002") {
          await reply.code(409).send({
            error: "VIN_ALREADY_EXISTS",
          });
          return;
        }

        throw error;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>("/seller/vehicles/:id", async function deleteSellerVehicleHandler(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.auth?.userId;
    const companyId = request.auth?.companyId;
    const { id } = request.params;

    if (!actorId || !companyId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const auctions = await prisma.auction.findMany({
      where: {
        vehicleId: id,
        sellerCompanyId: companyId,
        transitions: {
          none: {
            trigger: "EVENT_META",
          },
        },
      },
      select: {
        id: true,
        state: true,
      },
    });

    if (auctions.length === 0) {
      await reply.code(404).send({
        error: "VEHICLE_NOT_FOUND",
      });
      return;
    }

    if (auctions.some((auction) => auction.state !== "DRAFT")) {
      await reply.code(409).send({
        error: "VEHICLE_DELETE_BLOCKED",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.auction.deleteMany({
        where: {
          vehicleId: id,
          sellerCompanyId: companyId,
        },
      });

      await tx.vehicle.delete({
        where: {
          id,
        },
      });

      await createAuditLog(tx, {
        actorId,
        action: "SELLER_VEHICLE_DELETED",
        entityType: "Vehicle",
        entityId: id,
        payload: {
          companyId,
          vehicleId: id,
          auctionIds: auctions.map((auction) => auction.id),
        },
      });
    });

    await reply.code(200).send({
      success: true,
    });
  });

  fastify.get<{ Querystring: { q?: string; status?: string; sort?: string } }>(
    "/seller/auctions",
    async function sellerAuctionsHandler(
      request: FastifyRequest<{ Querystring: { q?: string; status?: string; sort?: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const companyId = request.auth?.companyId;

      if (!companyId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      const parsedQuery = sellerAuctionListQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(reply, await mapZodIssues(parsedQuery.error.issues));
        return;
      }

      const { q, sort, status } = parsedQuery.data;
    const auctions = await prisma.auction.findMany({
      where: {
        sellerCompanyId: companyId,
        transitions: {
          none: {
            trigger: "EVENT_META",
          },
        },
      },
        include: {
          vehicle: {
            select: {
              id: true,
              brand: true,
              model: true,
              year: true,
              vin: true,
            },
          },
          _count: {
            select: {
              bids: true,
            },
          },
        },
        orderBy:
          sort === "oldest"
            ? [{ createdAt: "asc" }, { id: "asc" }]
            : sort === "price_asc"
              ? [{ currentPrice: "asc" }, { id: "asc" }]
              : sort === "price_desc"
                ? [{ currentPrice: "desc" }, { id: "asc" }]
                : [{ createdAt: "desc" }, { id: "desc" }],
      });

      const filtered = [];

      for (const auction of auctions) {
        if (!(await matchesAuctionState(auction.state, status ?? "ALL"))) {
          continue;
        }

        if (q) {
          const needle = q.toLowerCase();
          const label = auction.vehicle
            ? `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.vin}`.toLowerCase()
            : "";

          if (!label.includes(needle)) {
            continue;
          }
        }

        filtered.push({
          id: auction.id,
          state: auction.state,
          vehicleId: auction.vehicleId,
          vehicleLabel: auction.vehicle
            ? `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}`
            : auction.vehicleId,
          currentPrice: await toNumberValue(auction.currentPrice),
          startingPrice: await toNumberValue(auction.startingPrice),
          minIncrement: await toNumberValue(auction.minIncrement),
          buyNowPrice: auction.buyNowPrice === null ? null : await toNumberValue(auction.buyNowPrice),
          bidsCount: auction._count.bids,
          startsAt: auction.startsAt.toISOString(),
          endsAt: auction.endsAt.toISOString(),
        });
      }

      await reply.code(200).send({
        total: filtered.length,
        auctions: filtered,
      });
    },
  );

  fastify.post<{ Body: unknown }>("/seller/auctions", async function createSellerAuctionHandler(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.auth?.userId;
    const companyId = request.auth?.companyId;

    if (!actorId || !companyId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const parsedBody = sellerAuctionCreateSchema.safeParse(request.body);

    if (!parsedBody.success) {
      await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
      return;
    }

    const payload = parsedBody.data;
    const existingAuction = await prisma.auction.findFirst({
      where: {
        vehicleId: payload.vehicleId,
      },
      select: {
        sellerCompanyId: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    if (existingAuction && existingAuction.sellerCompanyId !== companyId) {
      await reply.code(403).send({
        error: "FORBIDDEN",
      });
      return;
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: {
        id: payload.vehicleId,
      },
      select: {
        id: true,
      },
    });

    if (!vehicle) {
      await reply.code(404).send({
        error: "VEHICLE_NOT_FOUND",
      });
      return;
    }

    const now = new Date();
    const startsAt = await toDateValue(payload.startsAt, now);
    const endsAt = await toDateValue(payload.endsAt, new Date(now.getTime() + 24 * 60 * 60 * 1000));

    if (endsAt <= startsAt) {
      await reply.code(400).send({
        error: "INVALID_AUCTION_WINDOW",
      });
      return;
    }

    const createdAuction = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.create({
        data: {
          vehicleId: payload.vehicleId,
          sellerCompanyId: companyId,
          state: "DRAFT",
          startsAt,
          endsAt,
          inspectionDropoffDate: payload.inspectionDropoffDate ? new Date(payload.inspectionDropoffDate) : null,
          viewingEndsAt: payload.viewingEndsAt ? new Date(payload.viewingEndsAt) : null,
          auctionStartsAt: payload.auctionStartsAt ? new Date(payload.auctionStartsAt) : startsAt,
          auctionEndsAt: payload.auctionEndsAt ? new Date(payload.auctionEndsAt) : endsAt,
          startingPrice: 0,
          currentPrice: 0,
          buyNowPrice: payload.buyNowPrice,
          minIncrement: payload.minIncrement,
        },
      });

      await tx.auctionStateTransition.create({
        data: {
          auctionId: auction.id,
          fromState: "DRAFT",
          toState: "DRAFT",
          trigger: "AUCTION_CREATED",
          actorId,
          reason: JSON.stringify({
            sellerCompanyId: companyId,
          }),
        },
      });

      await createAuditLog(tx, {
        actorId,
        action: "SELLER_AUCTION_CREATED",
        entityType: "Auction",
        entityId: auction.id,
        payload: {
          companyId,
          auctionId: auction.id,
          vehicleId: payload.vehicleId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          startingPrice: 0,
          buyNowPrice: payload.buyNowPrice ?? null,
          minIncrement: payload.minIncrement,
        },
      });

      return auction;
    });

    await reply.code(201).send({
      auction: {
        id: createdAuction.id,
        state: createdAuction.state,
        vehicleId: createdAuction.vehicleId,
      },
    });
  });

  fastify.get<{ Params: { id: string } }>("/seller/auctions/:id", async function getSellerAuctionHandler(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const companyId = request.auth?.companyId;
    const { id } = request.params;

    if (!companyId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const auction = await prisma.auction.findFirst({
      where: {
        id,
        sellerCompanyId: companyId,
        transitions: {
          none: {
            trigger: "EVENT_META",
          },
        },
      },
      include: {
        vehicle: true,
        _count: {
          select: {
            bids: true,
          },
        },
      },
    });

    if (!auction) {
      await reply.code(404).send({
        error: "AUCTION_NOT_FOUND",
      });
      return;
    }

    const bids = await prisma.bid.findMany({
      where: {
        auctionId: id,
      },
      orderBy: [{ amount: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        amount: true,
        createdAt: true,
        companyId: true,
      },
    });

    const companyIds = [...new Set(bids.map((bid) => bid.companyId))];
    const companies =
      companyIds.length > 0
        ? await prisma.company.findMany({
            where: {
              id: {
                in: companyIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];
    const companyById = new Map(companies.map((company) => [company.id, company.name]));

    await reply.code(200).send({
      auction: {
        id: auction.id,
        state: auction.state,
        vehicleId: auction.vehicleId,
        startsAt: auction.startsAt.toISOString(),
        endsAt: auction.endsAt.toISOString(),
        inspectionDropoffDate: await toIsoString(auction.inspectionDropoffDate),
        viewingEndsAt: await toIsoString(auction.viewingEndsAt),
        auctionStartsAt: await toIsoString(auction.auctionStartsAt),
        auctionEndsAt: await toIsoString(auction.auctionEndsAt),
        startingPrice: await toNumberValue(auction.startingPrice),
        currentPrice: await toNumberValue(auction.currentPrice),
        buyNowPrice: auction.buyNowPrice === null ? null : await toNumberValue(auction.buyNowPrice),
        minIncrement: await toNumberValue(auction.minIncrement),
        bidsCount: auction._count.bids,
        vehicle: auction.vehicle
          ? {
              id: auction.vehicle.id,
              brand: auction.vehicle.brand,
              model: auction.vehicle.model,
              year: auction.vehicle.year,
              vin: auction.vehicle.vin,
            }
          : null,
      },
      bids: await Promise.all(
        bids.map(async (bid, index) => ({
          id: bid.id,
          rank: index + 1,
          companyName: companyById.get(bid.companyId) ?? bid.companyId,
          amount: await toNumberValue(bid.amount),
          createdAt: bid.createdAt.toISOString(),
        })),
      ),
    });
  });

  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    "/seller/auctions/:id",
    async function updateSellerAuctionHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const companyId = request.auth?.companyId;
      const { id } = request.params;

      if (!actorId || !companyId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      const auction = await prisma.auction.findFirst({
        where: {
          id,
          sellerCompanyId: companyId,
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
        select: {
          id: true,
          state: true,
          startsAt: true,
          endsAt: true,
        },
      });

      if (!auction) {
        await reply.code(404).send({
          error: "AUCTION_NOT_FOUND",
        });
        return;
      }

      const parsedBody = sellerAuctionUpdateSchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const payload = parsedBody.data;
      const action = payload.action ?? "update";

      if (action === "publish") {
        await reply.code(409).send({
          error: "ADMIN_APPROVAL_REQUIRED",
          message: "Draft auctions are reviewed and scheduled by FleetBid admin.",
        });
        return;
      }

      if (action === "cancel") {
        if (!["DRAFT", "SCHEDULED", "LIVE", "EXTENDED"].includes(auction.state)) {
          await reply.code(409).send({
            error: "INVALID_STATE",
          });
          return;
        }

        await prisma.$transaction(async (tx) => {
          await tx.auction.update({
            where: {
              id,
            },
            data: {
              state: "CANCELED",
            },
          });

          await tx.auctionStateTransition.create({
            data: {
              auctionId: id,
              fromState: auction.state as "DRAFT" | "SCHEDULED" | "LIVE" | "EXTENDED",
              toState: "CANCELED",
              trigger: "AUCTION_CANCELED",
              actorId,
              reason: JSON.stringify({
                sellerCompanyId: companyId,
              }),
            },
          });

          await createAuditLog(tx, {
            actorId,
            action: "SELLER_AUCTION_CANCELED",
            entityType: "Auction",
            entityId: id,
            payload: {
              companyId,
              auctionId: id,
              previousState: auction.state,
              nextState: "CANCELED",
            },
          });
        });

        await reply.code(200).send({
          success: true,
        });
        return;
      }

      if (auction.state !== "DRAFT") {
        await reply.code(409).send({
          error: "INVALID_STATE",
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.auction.update({
          where: {
            id,
          },
          data: {
            inspectionDropoffDate: payload.inspectionDropoffDate ? new Date(payload.inspectionDropoffDate) : undefined,
            viewingEndsAt: undefined,
            auctionStartsAt: undefined,
            auctionEndsAt: undefined,
            buyNowPrice: payload.buyNowPrice === undefined ? undefined : payload.buyNowPrice,
            minIncrement: payload.minIncrement,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "SELLER_AUCTION_UPDATED",
          entityType: "Auction",
          entityId: id,
          payload: {
            companyId,
            auctionId: id,
            changes: {
              inspectionDropoffDate: payload.inspectionDropoffDate ?? null,
              buyNowPrice: payload.buyNowPrice ?? null,
              minIncrement: payload.minIncrement ?? null,
            },
          },
        });
      });

      await reply.code(200).send({
        success: true,
      });
    },
  );
}
