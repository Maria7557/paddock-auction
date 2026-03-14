import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import { requireAdminAuth } from "../lib/auth";

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

type JsonRecord = Record<string, unknown>;

type PendingReturnRow = {
  ledgerId: string;
  walletId: string;
  userId: string;
  email: string;
  amount: DecimalLike;
  reference: string | null;
  createdAt: Date;
};

type PendingRequestRow = {
  id: string;
  amount: DecimalLike;
  reference: string | null;
};

type EventMeta = {
  title?: string;
  description?: string;
};

type EventOrder = {
  vehicleIds?: string[];
};

const auctionStates = [
  "DRAFT",
  "SCHEDULED",
  "LIVE",
  "EXTENDED",
  "CLOSED",
  "PAYMENT_PENDING",
  "PAID",
  "DEFAULTED",
  "CANCELED",
  "RELISTED",
  "ENDED",
] as const;

const adminVehicleQuerySchema = z.object({
  status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"]).optional(),
  unassigned: z.enum(["true", "false"]).optional(),
});

const companyIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const userIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const depositUserIdParamsSchema = z.object({
  userId: z.string().trim().min(1),
});

const userStatusQuerySchema = z.object({
  status: z.enum(["PENDING_APPROVAL", "BLOCKED", "ACTIVE", "PENDING_KYC"]).optional(),
});

const reasonSchema = z.object({
  reason: z.string().trim().min(1),
});

const approveReturnSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

const refundDepositSchema = z.object({
  reason: z.string().trim().min(10),
  amount: z.coerce.number().int().positive(),
  auctionId: z.string().uuid().optional(),
});

const burnDepositSchema = z.object({
  reason: z.string().trim().min(10),
  auctionId: z.string().trim().min(1),
});

const eventQuerySchema = z.object({
  status: z.string().trim().optional(),
});

const eventSchema = z.object({
  title: z.string().trim().min(1),
  date: z.string().trim().min(1),
  startTime: z.string().trim().min(1).optional(),
  time: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
});

const eventIdParamsSchema = z.object({
  id: z.string().trim().min(1),
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

  throw new Error("Unable to convert decimal value");
}

async function toStoredJson(payload: unknown): Promise<any> {
  return JSON.parse(JSON.stringify(payload));
}

async function createPayloadHash(payload: unknown): Promise<string> {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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
          correlationId?: string;
          idempotencyKey?: string;
          payload: any;
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
    correlationId?: string;
    idempotencyKey?: string;
    payload: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      payload: await toStoredJson(input.payload),
      payloadHash: await createPayloadHash(input.payload),
    },
  });
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

async function parseEventMeta(reason: string | null): Promise<EventMeta> {
  if (!reason) {
    return {};
  }

  try {
    return JSON.parse(reason) as EventMeta;
  } catch {
    return {};
  }
}

async function parseEventOrder(reason: string | null): Promise<string[]> {
  if (!reason) {
    return [];
  }

  try {
    const parsed = JSON.parse(reason) as EventOrder;

    if (Array.isArray(parsed.vehicleIds)) {
      return parsed.vehicleIds;
    }

    return [];
  } catch {
    return [];
  }
}

async function resolveVehicleStatus(state: string | null): Promise<"PENDING" | "APPROVED" | "REJECTED"> {
  if (!state || state === "DRAFT") {
    return "PENDING";
  }

  if (state === "CANCELED") {
    return "REJECTED";
  }

  return "APPROVED";
}

async function isAuctionState(value: string): Promise<boolean> {
  return auctionStates.includes(value as (typeof auctionStates)[number]);
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireAdminAuth);

  fastify.get<{ Querystring: { status?: string; unassigned?: string } }>(
    "/admin/vehicles",
    async function getAdminVehiclesHandler(
      request: FastifyRequest<{ Querystring: { status?: string; unassigned?: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedQuery = adminVehicleQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(reply, await mapZodIssues(parsedQuery.error.issues));
        return;
      }

      const status = parsedQuery.data.status ?? "ALL";
      const onlyUnassigned = parsedQuery.data.unassigned === "true";
      const vehicles = await prisma.vehicle.findMany({
        include: {
          media: {
            orderBy: {
              sortOrder: "asc",
            },
            take: 1,
            select: {
              url: true,
            },
          },
          auctions: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              state: true,
            },
          },
        },
        orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
      });

      const filteredVehicles = [];

      for (const vehicle of vehicles) {
        const latestAuction = vehicle.auctions[0] ?? null;
        const latestState = latestAuction?.state ?? null;
        const resolvedStatus = await resolveVehicleStatus(latestState);

        if (status !== "ALL" && resolvedStatus !== status) {
          continue;
        }

        if (
          onlyUnassigned &&
          (latestState === "SCHEDULED" || latestState === "LIVE" || latestState === "EXTENDED")
        ) {
          continue;
        }

        filteredVehicles.push({
          id: vehicle.id,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin,
          marketPriceAed: await toNumberValue(vehicle.marketPrice),
          status: resolvedStatus,
          imageUrl: vehicle.media[0]?.url ?? vehicle.images[0] ?? null,
          label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
          latestAuctionId: latestAuction?.id ?? null,
        });
      }

      await reply.code(200).send({
        vehicles: filteredVehicles,
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/admin/vehicles/:id/approve",
    async function approveAdminVehicleHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = companyIdParamsSchema.safeParse(request.params);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const vehicle = await prisma.vehicle.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          auctions: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              state: true,
            },
          },
        },
      });

      if (!vehicle || vehicle.auctions.length === 0) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      const latestAuction = vehicle.auctions[0];

      await prisma.$transaction(async (tx) => {
        await tx.auction.update({
          where: {
            id: latestAuction.id,
          },
          data: {
            state: "SCHEDULED",
          },
        });

        await tx.auctionStateTransition.create({
          data: {
            auctionId: latestAuction.id,
            fromState: latestAuction.state,
            toState: "SCHEDULED",
            trigger: "ADMIN_VEHICLE_APPROVED",
            actorId,
            reason: JSON.stringify({
              vehicleId: id,
            }),
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "VEHICLE_APPROVED",
          entityType: "Vehicle",
          entityId: id,
          payload: {
            vehicleId: id,
            auctionId: latestAuction.id,
            previousState: latestAuction.state,
            nextState: "SCHEDULED",
          },
        });
      });

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/admin/vehicles/:id/reject",
    async function rejectAdminVehicleHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = companyIdParamsSchema.safeParse(request.params);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const vehicle = await prisma.vehicle.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          auctions: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              state: true,
            },
          },
        },
      });

      if (!vehicle || vehicle.auctions.length === 0) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      const latestAuction = vehicle.auctions[0];

      await prisma.$transaction(async (tx) => {
        await tx.auction.update({
          where: {
            id: latestAuction.id,
          },
          data: {
            state: "CANCELED",
          },
        });

        await tx.auctionStateTransition.create({
          data: {
            auctionId: latestAuction.id,
            fromState: latestAuction.state,
            toState: "CANCELED",
            trigger: "ADMIN_VEHICLE_REJECTED",
            actorId,
            reason: JSON.stringify({
              vehicleId: id,
            }),
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "VEHICLE_REJECTED",
          entityType: "Vehicle",
          entityId: id,
          payload: {
            vehicleId: id,
            auctionId: latestAuction.id,
            previousState: latestAuction.state,
            nextState: "CANCELED",
          },
        });
      });

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.get("/admin/companies/pending", async function getPendingCompaniesHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    void request;

    const companies = await prisma.company.findMany({
      where: {
        status: "PENDING_APPROVAL",
      },
      include: {
        users: {
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                email: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    await reply.code(200).send({
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
        status: company.status,
        createdAt: company.createdAt.toISOString(),
        companyUsers: company.users.map((membership) => ({
          id: membership.id,
          role: membership.role,
          userId: membership.user.id,
          userEmail: membership.user.email,
          userStatus: membership.user.status,
        })),
      })),
    });
  });

  fastify.post<{ Params: { id: string } }>(
    "/admin/companies/:id/approve",
    async function approveCompanyHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = companyIdParamsSchema.safeParse(request.params);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const updated = await prisma.$transaction(async (tx) => {
        const company = await tx.company.findUnique({
          where: {
            id,
          },
          include: {
            users: {
              where: {
                role: "SELLER_MANAGER",
              },
              select: {
                userId: true,
              },
            },
          },
        });

        if (!company) {
          return false;
        }

        await tx.company.update({
          where: {
            id,
          },
          data: {
            status: "ACTIVE",
          },
        });

        const sellerUserIds = company.users.map((link) => link.userId);

        if (sellerUserIds.length > 0) {
          await tx.user.updateMany({
            where: {
              id: {
                in: sellerUserIds,
              },
            },
            data: {
              status: "ACTIVE",
            },
          });
        }

        await createAuditLog(tx, {
          actorId,
          action: "COMPANY_APPROVED",
          entityType: "Company",
          entityId: id,
          payload: {
            companyId: id,
            status: "ACTIVE",
            sellerUserIds,
          },
        });

        return true;
      });

      if (!updated) {
        await reply.code(404).send({
          error: "COMPANY_NOT_FOUND",
        });
        return;
      }

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/admin/companies/:id/reject",
    async function rejectCompanyHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = companyIdParamsSchema.safeParse(request.params);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const updated = await prisma.$transaction(async (tx) => {
        const company = await tx.company.findUnique({
          where: {
            id,
          },
          include: {
            users: {
              where: {
                role: "SELLER_MANAGER",
              },
              select: {
                userId: true,
              },
            },
          },
        });

        if (!company) {
          return false;
        }

        await tx.company.update({
          where: {
            id,
          },
          data: {
            status: "REJECTED",
          },
        });

        const sellerUserIds = company.users.map((link) => link.userId);

        if (sellerUserIds.length > 0) {
          await tx.user.updateMany({
            where: {
              id: {
                in: sellerUserIds,
              },
            },
            data: {
              status: "REJECTED",
            },
          });
        }

        await createAuditLog(tx, {
          actorId,
          action: "COMPANY_REJECTED",
          entityType: "Company",
          entityId: id,
          payload: {
            companyId: id,
            status: "REJECTED",
            sellerUserIds,
          },
        });

        return true;
      });

      if (!updated) {
        await reply.code(404).send({
          error: "COMPANY_NOT_FOUND",
        });
        return;
      }

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.get<{ Querystring: { status?: string } }>(
    "/admin/users/pending",
    async function getPendingUsersHandler(
      request: FastifyRequest<{ Querystring: { status?: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedQuery = userStatusQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(reply, await mapZodIssues(parsedQuery.error.issues));
        return;
      }

      let whereClause:
        | {
            role?: "BUYER";
            status?: "PENDING_APPROVAL" | "BLOCKED" | "ACTIVE" | { in: Array<"PENDING_APPROVAL" | "BLOCKED"> };
            kycVerified?: boolean;
          }
        | undefined;

      if (parsedQuery.data.status === "PENDING_KYC") {
        whereClause = {
          role: "BUYER",
          status: "ACTIVE",
          kycVerified: false,
        };
      } else if (parsedQuery.data.status) {
        whereClause = {
          status: parsedQuery.data.status,
        };
      } else {
        whereClause = {
          status: {
            in: ["PENDING_APPROVAL", "BLOCKED"],
          },
        };
      }

      const users = await prisma.user.findMany({
        where: whereClause,
        include: {
          wallet: {
            select: {
              balance: true,
            },
          },
          companyUsers: {
            select: {
              id: true,
              role: true,
              company: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      await reply.code(200).send({
        users: await Promise.all(
          users.map(async (user) => ({
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            kycVerified: user.kycVerified,
            walletBalance: await toNumberValue(user.wallet?.balance),
            hasDeposit: (await toNumberValue(user.wallet?.balance)) > 0,
            createdAt: user.createdAt.toISOString(),
            companyUsers: user.companyUsers.map((membership) => ({
              id: membership.id,
              role: membership.role,
              companyId: membership.company.id,
              companyName: membership.company.name,
              companyStatus: membership.company.status,
            })),
          })),
        ),
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/admin/users/:id/approve-kyc",
    async function approveUserKycHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = userIdParamsSchema.safeParse(request.params);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          role: true,
        },
      });

      if (!user) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      if (user.role !== "BUYER") {
        await reply.code(400).send({
          error: "NOT_A_BUYER",
        });
        return;
      }

      const correlationId = request.headers["x-correlation-id"]?.toString().trim();
      const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: {
            id,
          },
          data: {
            kycVerified: true,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "BUYER_KYC_APPROVED",
          entityType: "User",
          entityId: id,
          correlationId,
          idempotencyKey,
          payload: {
            userId: id,
            kycVerified: true,
          },
        });
      });

      await reply.code(200).send({
        userId: id,
        kycVerified: true,
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/admin/users/:id/block",
    async function blockUserHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedBody = reasonSchema.safeParse(request.body);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
        },
      });

      if (!user) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      const correlationId = request.headers["x-correlation-id"]?.toString().trim();
      const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: {
            id,
          },
          data: {
            status: "BLOCKED",
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "USER_BLOCKED",
          entityType: "User",
          entityId: id,
          correlationId,
          idempotencyKey,
          payload: {
            userId: id,
            status: "BLOCKED",
            reason: parsedBody.data.reason,
          },
        });
      });

      await reply.code(200).send({
        userId: id,
        status: "BLOCKED",
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/admin/users/:id/unblock",
    async function unblockUserHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedBody = reasonSchema.safeParse(request.body);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!user) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      if (user.status !== "BLOCKED") {
        await reply.code(400).send({
          error: "USER_NOT_BLOCKED",
        });
        return;
      }

      const correlationId = request.headers["x-correlation-id"]?.toString().trim();
      const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: {
            id,
          },
          data: {
            status: "ACTIVE",
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "USER_UNBLOCKED",
          entityType: "User",
          entityId: id,
          correlationId,
          idempotencyKey,
          payload: {
            userId: id,
            status: "ACTIVE",
            reason: parsedBody.data.reason,
          },
        });
      });

      await reply.code(200).send({
        userId: id,
        status: "ACTIVE",
      });
    },
  );

  fastify.get<{ Querystring: { status?: string } }>(
    "/admin/events",
    async function getAdminEventsHandler(
      request: FastifyRequest<{ Querystring: { status?: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedQuery = eventQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(reply, await mapZodIssues(parsedQuery.error.issues));
        return;
      }

      const rawStatus = parsedQuery.data.status?.toUpperCase() ?? "";
      const where =
        rawStatus && (await isAuctionState(rawStatus))
          ? {
              state: rawStatus as (typeof auctionStates)[number],
            }
          : undefined;

      const auctions = await prisma.auction.findMany({
        where,
        include: {
          transitions: {
            where: {
              trigger: "EVENT_META",
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      });

      const grouped = new Map<
        string,
        {
          id: string;
          title: string;
          startsAt: string;
          endsAt: string;
          status: string;
          lotsCount: number;
        }
      >();

      for (const auction of auctions) {
        const key = `${auction.startsAt.toISOString()}::${auction.endsAt.toISOString()}`;
        const existing = grouped.get(key);

        if (existing) {
          grouped.set(key, {
            ...existing,
            lotsCount: existing.lotsCount + 1,
          });
          continue;
        }

        const meta = await parseEventMeta(auction.transitions[0]?.reason ?? null);

        grouped.set(key, {
          id: auction.id,
          title:
            meta.title?.trim() || `Auction Event ${auction.startsAt.toLocaleDateString("en-GB")}`,
          startsAt: auction.startsAt.toISOString(),
          endsAt: auction.endsAt.toISOString(),
          status: auction.state,
          lotsCount: 1,
        });
      }

      await reply.code(200).send({
        events: [...grouped.values()],
      });
    },
  );

  fastify.post<{ Body: unknown }>("/admin/events", async function createAdminEventHandler(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.auth?.userId;
    const parsedBody = eventSchema.safeParse(request.body);

    if (!actorId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    if (!parsedBody.success) {
      await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
      return;
    }

    const startTime = parsedBody.data.startTime ?? parsedBody.data.time;

    if (!startTime) {
      await reply.code(400).send({
        error: "INVALID_PAYLOAD",
      });
      return;
    }

    const startsAt = new Date(`${parsedBody.data.date}T${startTime}:00+04:00`);

    if (Number.isNaN(startsAt.getTime())) {
      await reply.code(400).send({
        error: "INVALID_EVENT_DATE",
      });
      return;
    }

    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    const seedAuction = await prisma.auction.findFirst({
      select: {
        vehicleId: true,
        sellerCompanyId: true,
        minIncrement: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    if (!seedAuction) {
      await reply.code(400).send({
        error: "NO_BASE_VEHICLE",
      });
      return;
    }

    const createdAuction = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.create({
        data: {
          vehicleId: seedAuction.vehicleId,
          sellerCompanyId: seedAuction.sellerCompanyId,
          state: "DRAFT",
          startsAt,
          endsAt,
          startingPrice: 0,
          currentPrice: 0,
          minIncrement: seedAuction.minIncrement,
        },
      });

      await tx.auctionStateTransition.create({
        data: {
          auctionId: auction.id,
          fromState: "DRAFT",
          toState: "DRAFT",
          trigger: "EVENT_META",
          reason: JSON.stringify({
            title: parsedBody.data.title,
            description: parsedBody.data.description ?? "",
          }),
          actorId,
        },
      });

      await createAuditLog(tx, {
        actorId,
        action: "EVENT_CREATED",
        entityType: "Event",
        entityId: auction.id,
        payload: {
          eventId: auction.id,
          title: parsedBody.data.title,
          date: parsedBody.data.date,
          time: startTime,
          description: parsedBody.data.description ?? "",
        },
      });

      return auction;
    });

    await reply.code(201).send({
      id: createdAuction.id,
      success: true,
    });
  });

  fastify.get<{ Params: { id: string } }>("/admin/events/:id", async function getAdminEventHandler(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsedParams = eventIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
      return;
    }

    const { id } = parsedParams.data;
    const event = await prisma.auction.findUnique({
      where: {
        id,
      },
      include: {
        transitions: {
          where: {
            trigger: {
              in: ["EVENT_META", "EVENT_ORDER"],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!event) {
      await reply.code(404).send({
        error: "EVENT_NOT_FOUND",
      });
      return;
    }

    const lots = await prisma.auction.findMany({
      where: {
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
      include: {
        vehicle: {
          select: {
            id: true,
            brand: true,
            model: true,
            year: true,
            vin: true,
            marketPrice: true,
            images: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const metaTransition = event.transitions.find((item) => item.trigger === "EVENT_META") ?? null;
    const orderTransition = event.transitions.find((item) => item.trigger === "EVENT_ORDER") ?? null;
    const meta = await parseEventMeta(metaTransition?.reason ?? null);
    const vehicleOrder = await parseEventOrder(orderTransition?.reason ?? null);
    const orderIndexByVehicleId = new Map(vehicleOrder.map((vehicleId, index) => [vehicleId, index]));
    const orderedLots = [...lots].sort((left, right) => {
      const leftOrder = orderIndexByVehicleId.get(left.vehicleId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderIndexByVehicleId.get(right.vehicleId) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });

    await reply.code(200).send({
      id: event.id,
      title: meta.title ?? `Auction Event ${event.startsAt.toISOString()}`,
      description: meta.description ?? "",
      status: event.state,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      lots: await Promise.all(
        orderedLots.map(async (lot) => ({
          auctionId: lot.id,
          vehicleId: lot.vehicleId,
          title: `${lot.vehicle.brand} ${lot.vehicle.model} ${lot.vehicle.year}`,
          vin: lot.vehicle.vin,
          marketPriceAed: await toNumberValue(lot.vehicle.marketPrice),
          imageUrl: lot.vehicle.images[0] ?? null,
        })),
      ),
    });
  });

  fastify.delete<{ Params: { id: string } }>("/admin/events/:id", async function deleteAdminEventHandler(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.auth?.userId;
    const parsedParams = eventIdParamsSchema.safeParse(request.params);

    if (!actorId) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    if (!parsedParams.success) {
      await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
      return;
    }

    const { id } = parsedParams.data;
    const event = await prisma.auction.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        state: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!event) {
      await reply.code(404).send({
        error: "EVENT_NOT_FOUND",
      });
      return;
    }

    if (event.state !== "DRAFT") {
      await reply.code(400).send({
        error: "EVENT_DELETE_ALLOWED_ONLY_FOR_DRAFT",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.auction.deleteMany({
        where: {
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          state: "DRAFT",
        },
      });

      await createAuditLog(tx, {
        actorId,
        action: "EVENT_DELETED",
        entityType: "Event",
        entityId: id,
        payload: {
          eventId: id,
        },
      });
    });

    await reply.code(200).send({
      success: true,
    });
  });

  fastify.get("/admin/deposits/pending-returns", async function getPendingReturnsHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    void request;

    const pendingReturns = await prisma.$queryRaw<PendingReturnRow[]>`
      SELECT
        req.id AS "ledgerId",
        req."walletId" AS "walletId",
        w."userId" AS "userId",
        u.email AS "email",
        req.amount AS "amount",
        req.reference AS "reference",
        req."createdAt" AS "createdAt"
      FROM "WalletLedger" AS req
      JOIN "Wallet" AS w ON w.id = req."walletId"
      JOIN "User" AS u ON u.id = w."userId"
      LEFT JOIN "WalletLedger" AS appr
        ON appr."walletId" = req."walletId"
        AND appr.type = 'WITHDRAWAL_APPROVED'
        AND appr.reference = req.reference
      WHERE req.type = 'WITHDRAWAL_REQUESTED'
        AND appr.id IS NULL
      ORDER BY req."createdAt" ASC
    `;

    await reply.code(200).send({
      returns: await Promise.all(
        pendingReturns.map(async (row) => ({
          ledgerId: row.ledgerId,
          walletId: row.walletId,
          userId: row.userId,
          email: row.email,
          amount: await toNumberValue(row.amount),
          reference: row.reference,
          createdAt: row.createdAt.toISOString(),
        })),
      ),
    });
  });

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    "/admin/deposits/:userId/approve-return",
    async function approveDepositReturnHandler(
      request: FastifyRequest<{ Params: { userId: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = depositUserIdParamsSchema.safeParse(request.params);
      const parsedBody = approveReturnSchema.safeParse(request.body ?? {});

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const normalizedUserId = parsedParams.data.userId;
      const buyer = await prisma.user.findUnique({
        where: {
          id: normalizedUserId,
        },
        select: {
          id: true,
          role: true,
        },
      });

      if (!buyer) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      if (buyer.role !== "BUYER") {
        await reply.code(400).send({
          error: "NOT_A_BUYER",
        });
        return;
      }

      const wallet = await prisma.wallet.findUnique({
        where: {
          userId: normalizedUserId,
        },
        select: {
          id: true,
        },
      });

      if (!wallet) {
        await reply.code(404).send({
          error: "WALLET_NOT_FOUND",
        });
        return;
      }

      const pendingRows = await prisma.$queryRaw<PendingRequestRow[]>`
        SELECT req.id, req.amount, req.reference
        FROM "WalletLedger" AS req
        LEFT JOIN "WalletLedger" AS appr
          ON appr."walletId" = req."walletId"
          AND appr.type = 'WITHDRAWAL_APPROVED'
          AND appr.reference = req.reference
        WHERE req."walletId" = ${wallet.id}
          AND req.type = 'WITHDRAWAL_REQUESTED'
          AND appr.id IS NULL
        ORDER BY req."createdAt" ASC
        LIMIT 1
      `;

      const pendingRequest = pendingRows[0];

      if (!pendingRequest) {
        await reply.code(404).send({
          error: "NO_PENDING_RETURN_REQUEST",
        });
        return;
      }

      const correlationId = request.headers["x-correlation-id"]?.toString().trim();
      const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();

      await prisma.$transaction(async (tx) => {
        const requestedAmount = await toNumberValue(pendingRequest.amount);
        const approvalAmount = Math.abs(requestedAmount);

        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "WITHDRAWAL_APPROVED",
            amount: approvalAmount,
            reference: pendingRequest.reference ?? pendingRequest.id,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "DEPOSIT_RETURN_APPROVED",
          entityType: "User",
          entityId: normalizedUserId,
          correlationId,
          idempotencyKey,
          payload: {
            userId: normalizedUserId,
            reason: parsedBody.data.reason ?? null,
            requestLedgerId: pendingRequest.id,
            approvedAmount: approvalAmount,
          },
        });
      });

      await reply.code(200).send({
        userId: normalizedUserId,
        status: "APPROVED",
        message: "Refund will be processed within 7 days",
      });
    },
  );

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    "/admin/deposits/:userId/refund",
    async function refundDepositHandler(
      request: FastifyRequest<{ Params: { userId: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = depositUserIdParamsSchema.safeParse(request.params);
      const parsedBody = refundDepositSchema.safeParse(request.body);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const normalizedUserId = parsedParams.data.userId;
      const buyer = await prisma.user.findUnique({
        where: {
          id: normalizedUserId,
        },
        select: {
          id: true,
          role: true,
        },
      });

      if (!buyer) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      if (buyer.role !== "BUYER") {
        await reply.code(400).send({
          error: "NOT_A_BUYER",
        });
        return;
      }

      const wallet = await prisma.wallet.findUnique({
        where: {
          userId: normalizedUserId,
        },
        select: {
          id: true,
        },
      });

      if (!wallet) {
        await reply.code(404).send({
          error: "WALLET_NOT_FOUND",
        });
        return;
      }

      const correlationId = request.headers["x-correlation-id"]?.toString().trim();
      const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();
      const result = await prisma.$transaction(async (tx) => {
        const updatedWallet = await tx.wallet.update({
          where: {
            id: wallet.id,
          },
          data: {
            balance: {
              increment: parsedBody.data.amount,
            },
          },
          select: {
            balance: true,
          },
        });

        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "ADMIN_REFUND",
            amount: parsedBody.data.amount,
            reference: parsedBody.data.auctionId ?? actorId,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "DEPOSIT_REFUNDED_BY_ADMIN",
          entityType: "User",
          entityId: normalizedUserId,
          correlationId,
          idempotencyKey,
          payload: {
            userId: normalizedUserId,
            amount: parsedBody.data.amount,
            reason: parsedBody.data.reason,
            auctionId: parsedBody.data.auctionId ?? null,
          },
        });

        return {
          newBalance: await toNumberValue(updatedWallet.balance),
        };
      });

      await reply.code(200).send({
        userId: normalizedUserId,
        refundedAmount: parsedBody.data.amount,
        newBalance: result.newBalance,
        reason: parsedBody.data.reason,
      });
    },
  );

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    "/admin/deposits/:userId/burn",
    async function burnDepositHandler(
      request: FastifyRequest<{ Params: { userId: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = depositUserIdParamsSchema.safeParse(request.params);
      const parsedBody = burnDepositSchema.safeParse(request.body);

      if (!actorId) {
        await reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const normalizedUserId = parsedParams.data.userId;
      const buyer = await prisma.user.findUnique({
        where: {
          id: normalizedUserId,
        },
        select: {
          id: true,
          role: true,
        },
      });

      if (!buyer) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      if (buyer.role !== "BUYER") {
        await reply.code(400).send({
          error: "NOT_A_BUYER",
        });
        return;
      }

      const wallet = await prisma.wallet.findUnique({
        where: {
          userId: normalizedUserId,
        },
        select: {
          id: true,
        },
      });

      if (!wallet) {
        await reply.code(404).send({
          error: "WALLET_NOT_FOUND",
        });
        return;
      }

      const activeLock = await prisma.depositLock.findFirst({
        where: {
          auctionId: parsedBody.data.auctionId,
          walletId: wallet.id,
          status: "ACTIVE",
        },
        select: {
          id: true,
          amount: true,
        },
      });

      if (!activeLock) {
        await reply.code(400).send({
          error: "NO_ACTIVE_DEPOSIT_LOCK",
        });
        return;
      }

      const correlationId = request.headers["x-correlation-id"]?.toString().trim();
      const idempotencyKey = request.headers["idempotency-key"]?.toString().trim();
      const lockAmount = await toNumberValue(activeLock.amount);
      const result = await prisma.$transaction(async (tx) => {
        await tx.depositLock.update({
          where: {
            id: activeLock.id,
          },
          data: {
            status: "BURNED",
            burnedAt: new Date(),
            resolutionReason: parsedBody.data.reason,
          },
        });

        const updatedWallet = await tx.wallet.updateMany({
          where: {
            id: wallet.id,
            balance: {
              gte: lockAmount,
            },
            lockedBalance: {
              gte: lockAmount,
            },
          },
          data: {
            balance: {
              decrement: lockAmount,
            },
            lockedBalance: {
              decrement: lockAmount,
            },
          },
        });

        if (updatedWallet.count === 0) {
          return {
            insufficientWalletBalance: true,
            burnedAmount: 0,
          } as const;
        }

        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "DEPOSIT_BURN",
            amount: lockAmount * -1,
            reference: parsedBody.data.auctionId,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "DEPOSIT_BURNED",
          entityType: "User",
          entityId: normalizedUserId,
          correlationId,
          idempotencyKey,
          payload: {
            userId: normalizedUserId,
            auctionId: parsedBody.data.auctionId,
            burnedAmount: lockAmount,
            reason: parsedBody.data.reason,
            depositLockId: activeLock.id,
          },
        });

        return {
          insufficientWalletBalance: false,
          burnedAmount: lockAmount,
        } as const;
      });

      if (result.insufficientWalletBalance) {
        await reply.code(409).send({
          error: "INSUFFICIENT_WALLET_BALANCE_FOR_BURN",
        });
        return;
      }

      await reply.code(200).send({
        userId: normalizedUserId,
        auctionId: parsedBody.data.auctionId,
        burnedAmount: result.burnedAmount,
        reason: parsedBody.data.reason,
      });
    },
  );
}
