import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import { requireAdminAuth } from "../lib/auth";
import { sendNewEventAnnouncementEmail } from "../lib/email";

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
  status: z.enum(["PENDING_APPROVAL", "BLOCKED", "ACTIVE", "REJECTED", "PENDING_KYC"]).optional(),
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
  scheduledAt: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  startTime: z.string().trim().min(1).optional(),
  time: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  if (value.scheduledAt) {
    return;
  }

  if (!value.date?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["date"],
      message: "Date is required",
    });
  }

  if (!(value.startTime?.trim() || value.time?.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startTime"],
      message: "Start time is required",
    });
  }
});

const eventIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const setMarketPriceSchema = z.object({
  priceAed: z.coerce.number().positive(),
});

const assignVehicleEventSchema = z.object({
  eventId: z.string().trim().min(1).nullable().optional(),
});

const eventVehicleSchema = z.object({
  vehicleId: z.string().trim().min(1),
});

const eventOrderSchema = z.object({
  vehicleIds: z.array(z.string().trim().min(1)).default([]),
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

async function resolveAssignedEventId(
  transition:
    | {
        trigger: string;
        reason: string | null;
      }
    | null
    | undefined,
): Promise<string | null> {
  if (!transition || transition.trigger !== "EVENT_ASSIGNED" || !transition.reason) {
    return null;
  }

  try {
    const parsed = JSON.parse(transition.reason) as { eventId?: string | null };
    const eventId = parsed.eventId?.trim();

    return eventId && eventId.length > 0 ? eventId : null;
  } catch {
    return null;
  }
}

type VehicleWorkflowTransition = {
  trigger: string;
  reason: string | null;
};

function readLatestEventAssignmentTransition(
  transitions: VehicleWorkflowTransition[] | null | undefined,
): VehicleWorkflowTransition | null {
  return (
    transitions?.find((transition) => transition.trigger === "EVENT_ASSIGNED" || transition.trigger === "EVENT_UNASSIGNED") ??
    null
  );
}

function hasVehicleApprovalTransition(transitions: VehicleWorkflowTransition[] | null | undefined): boolean {
  return transitions?.some((transition) => transition.trigger === "ADMIN_VEHICLE_APPROVED") ?? false;
}

async function resolveVehicleStatus(
  state: string | null,
  hasAdminApproval = false,
): Promise<"PENDING" | "APPROVED" | "REJECTED"> {
  if (!state) {
    return "PENDING";
  }

  if (state === "CANCELED") {
    return "REJECTED";
  }

  if (state === "DRAFT") {
    return hasAdminApproval ? "APPROVED" : "PENDING";
  }

  return "APPROVED";
}

function isSchemaDriftPrismaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

type AdminVehicleListRow = {
  id: string;
  brand: string;
  model: string;
  year: number;
  vin: string;
  marketPrice: DecimalLike;
  imageUrl: string | null;
  latestAuctionId: string | null;
  latestAuctionState: string | null;
  sellerCompanyId: string | null;
  latestTransitions: VehicleWorkflowTransition[];
};

async function loadAdminVehicleListRows(): Promise<AdminVehicleListRow[]> {
  try {
    const vehicles = await prisma.vehicle.findMany({
      select: {
        id: true,
        brand: true,
        model: true,
        year: true,
        vin: true,
        marketPrice: true,
        images: true,
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
          where: {
            transitions: {
              none: {
                trigger: "EVENT_META",
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            state: true,
            sellerCompanyId: true,
            transitions: {
              where: {
                trigger: {
                  in: ["EVENT_ASSIGNED", "EVENT_UNASSIGNED", "ADMIN_VEHICLE_APPROVED"],
                },
              },
              orderBy: {
                createdAt: "desc",
              },
              take: 3,
              select: {
                trigger: true,
                reason: true,
              },
            },
          },
        },
      },
      orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
    });

    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      marketPrice: vehicle.marketPrice,
      imageUrl: vehicle.media[0]?.url ?? vehicle.images[0] ?? null,
      latestAuctionId: vehicle.auctions[0]?.id ?? null,
      latestAuctionState: vehicle.auctions[0]?.state ?? null,
      sellerCompanyId: vehicle.auctions[0]?.sellerCompanyId ?? null,
      latestTransitions: vehicle.auctions[0]?.transitions ?? [],
    }));
  } catch (error) {
    if (!isSchemaDriftPrismaError(error)) {
      throw error;
    }

    const vehicles = await prisma.vehicle.findMany({
      select: {
        id: true,
        brand: true,
        model: true,
        year: true,
        vin: true,
        auctions: {
          where: {
            transitions: {
              none: {
                trigger: "EVENT_META",
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            state: true,
            sellerCompanyId: true,
            transitions: {
              where: {
                trigger: {
                  in: ["EVENT_ASSIGNED", "EVENT_UNASSIGNED", "ADMIN_VEHICLE_APPROVED"],
                },
              },
              orderBy: {
                createdAt: "desc",
              },
              take: 3,
              select: {
                trigger: true,
                reason: true,
              },
            },
          },
        },
      },
      orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
    });

    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      marketPrice: 0,
      imageUrl: null,
      latestAuctionId: vehicle.auctions[0]?.id ?? null,
      latestAuctionState: vehicle.auctions[0]?.state ?? null,
      sellerCompanyId: vehicle.auctions[0]?.sellerCompanyId ?? null,
      latestTransitions: vehicle.auctions[0]?.transitions ?? [],
    }));
  }
}

async function isAuctionState(value: string): Promise<boolean> {
  return auctionStates.includes(value as (typeof auctionStates)[number]);
}

function mapAdminCompany(company: {
  id: string;
  name: string;
  phone?: string | null;
  status: string;
  createdAt: Date;
  users: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      email: string;
      status: string;
    };
  }>;
}): {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  createdAt: string;
  companyUsers: Array<{
    id: string;
    role: string;
    userId: string;
    userEmail: string;
    userStatus: string;
  }>;
} {
  return {
    id: company.id,
    name: company.name,
    phone: company.phone?.trim() || null,
    status: company.status,
    createdAt: company.createdAt.toISOString(),
    companyUsers: company.users.map((membership) => ({
      id: membership.id,
      role: membership.role,
      userId: membership.user.id,
      userEmail: membership.user.email,
      userStatus: membership.user.status,
    })),
  };
}

function isSellerCompany(company: {
  users: Array<{
    role: string;
  }>;
}): boolean {
  return company.users.some((membership) => membership.role === "SELLER_MANAGER");
}

function formatAdminStatus(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function assignVehicleToEvent(input: {
  actorId: string;
  vehicleId: string;
  eventId: string | null;
}): Promise<
  | { ok: true; auctionId: string; eventId: string | null }
  | { ok: false; statusCode: number; body: Record<string, string> }
> {
  const latestVehicleAuction = await prisma.vehicle.findUnique({
    where: {
      id: input.vehicleId,
    },
    select: {
      id: true,
      auctions: {
        where: {
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          state: true,
          startsAt: true,
          endsAt: true,
          auctionStartsAt: true,
          auctionEndsAt: true,
        },
      },
    },
  });

  if (!latestVehicleAuction || latestVehicleAuction.auctions.length === 0) {
    return {
      ok: false,
      statusCode: 404,
      body: {
        error: "VEHICLE_NOT_FOUND",
      },
    };
  }

  const latestAuction = latestVehicleAuction.auctions[0];

  if (latestAuction.state === "CANCELED") {
    return {
      ok: false,
      statusCode: 409,
      body: {
        error: "VEHICLE_REJECTED",
      },
    };
  }

  if (input.eventId) {
    const event = await prisma.auction.findUnique({
      where: {
        id: input.eventId,
      },
      select: {
        id: true,
        state: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!event) {
      return {
        ok: false,
        statusCode: 404,
        body: {
          error: "EVENT_NOT_FOUND",
        },
      };
    }

    if (!["DRAFT", "SCHEDULED"].includes(event.state)) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: "EVENT_ASSIGNMENT_LOCKED",
        },
      };
    }

    await prisma.$transaction(async (tx) => {
      const nextAuctionState = latestAuction.state === "DRAFT" ? "SCHEDULED" : latestAuction.state;

      await tx.auction.update({
        where: {
          id: latestAuction.id,
        },
        data: {
          state: nextAuctionState,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        },
      });

      await tx.auctionStateTransition.create({
        data: {
          auctionId: latestAuction.id,
          fromState: latestAuction.state,
          toState: nextAuctionState,
          trigger: "EVENT_ASSIGNED",
          actorId: input.actorId,
          reason: JSON.stringify({
            eventId: event.id,
          }),
        },
      });

      await createAuditLog(tx, {
        actorId: input.actorId,
        action: "VEHICLE_EVENT_ASSIGNED",
        entityType: "Vehicle",
        entityId: input.vehicleId,
        payload: {
          vehicleId: input.vehicleId,
          auctionId: latestAuction.id,
          eventId: event.id,
          previousState: latestAuction.state,
          nextState: nextAuctionState,
        },
      });
    });

    return {
      ok: true,
      auctionId: latestAuction.id,
      eventId: input.eventId,
    };
  }

  await prisma.$transaction(async (tx) => {
    const nextAuctionState = latestAuction.state === "SCHEDULED" ? "DRAFT" : latestAuction.state;

    await tx.auction.update({
      where: {
        id: latestAuction.id,
      },
      data: {
        state: nextAuctionState,
        startsAt: latestAuction.auctionStartsAt ?? latestAuction.startsAt,
        endsAt: latestAuction.auctionEndsAt ?? latestAuction.endsAt,
      },
    });

    await tx.auctionStateTransition.create({
      data: {
        auctionId: latestAuction.id,
        fromState: latestAuction.state,
        toState: nextAuctionState,
        trigger: "EVENT_UNASSIGNED",
        actorId: input.actorId,
        reason: JSON.stringify({
          eventId: null,
        }),
      },
    });

    await createAuditLog(tx, {
      actorId: input.actorId,
      action: "VEHICLE_EVENT_UNASSIGNED",
      entityType: "Vehicle",
      entityId: input.vehicleId,
      payload: {
        vehicleId: input.vehicleId,
        auctionId: latestAuction.id,
        eventId: null,
        previousState: latestAuction.state,
        nextState: nextAuctionState,
      },
    });
  });

  return {
    ok: true,
    auctionId: latestAuction.id,
    eventId: null,
  };
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
      const vehicles = await loadAdminVehicleListRows();

      const sellerCompanyIds = Array.from(
        new Set(
          vehicles
            .map((vehicle) => vehicle.sellerCompanyId)
            .filter((companyId): companyId is string => typeof companyId === "string" && companyId.length > 0),
        ),
      );
      const companies = sellerCompanyIds.length
        ? await prisma.company.findMany({
            where: {
              id: {
                in: sellerCompanyIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];
      const companyNameById = new Map(companies.map((company) => [company.id, company.name]));

      const filteredVehicles = [];

      for (const vehicle of vehicles) {
        const latestState = vehicle.latestAuctionState;
        const resolvedStatus = await resolveVehicleStatus(
          latestState,
          hasVehicleApprovalTransition(vehicle.latestTransitions),
        );
        const assignedEventId = await resolveAssignedEventId(
          readLatestEventAssignmentTransition(vehicle.latestTransitions),
        );

        if (status !== "ALL" && resolvedStatus !== status) {
          continue;
        }

        if (onlyUnassigned && assignedEventId) {
          continue;
        }

        filteredVehicles.push({
          id: vehicle.id,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin,
          marketPriceAed: vehicle.marketPrice === null ? null : await toNumberValue(vehicle.marketPrice),
          status: resolvedStatus,
          imageUrl: vehicle.imageUrl,
          label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
          latestAuctionId: vehicle.latestAuctionId,
          companyName:
            companyNameById.get(vehicle.sellerCompanyId ?? "") ?? "Fleet Operator",
          assignedEventId,
        });
      }

      await reply.code(200).send({
        vehicles: filteredVehicles,
      });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/admin/vehicles/:id",
    async function getAdminVehicleDetailHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = companyIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const vehicle = await prisma.vehicle.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        include: {
          media: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              url: true,
              type: true,
              sortOrder: true,
            },
          },
          auctions: {
            where: {
              transitions: {
                none: {
                  trigger: "EVENT_META",
                },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              state: true,
              sellerCompanyId: true,
              startsAt: true,
              endsAt: true,
              inspectionDropoffDate: true,
              viewingEndsAt: true,
              auctionStartsAt: true,
              auctionEndsAt: true,
              currentPrice: true,
              startingPrice: true,
              buyNowPrice: true,
              minIncrement: true,
              transitions: {
                where: {
                  trigger: {
                    in: ["EVENT_ASSIGNED", "EVENT_UNASSIGNED", "ADMIN_VEHICLE_APPROVED"],
                  },
                },
                orderBy: {
                  createdAt: "desc",
                },
                take: 3,
                select: {
                  trigger: true,
                  reason: true,
                },
              },
            },
          },
        },
      });

      if (!vehicle) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      const latestAuction = vehicle.auctions[0] ?? null;
      const latestTransitions = latestAuction?.transitions ?? [];
      const assignedEventId = await resolveAssignedEventId(readLatestEventAssignmentTransition(latestTransitions));
      const sellerCompanyId = latestAuction?.sellerCompanyId ?? null;
      const [company, assignedEvent] = await Promise.all([
        sellerCompanyId
          ? prisma.company.findUnique({
              where: {
                id: sellerCompanyId,
              },
              select: {
                id: true,
                name: true,
                status: true,
              },
            })
          : null,
        assignedEventId
          ? prisma.auction.findUnique({
              where: {
                id: assignedEventId,
              },
              select: {
                id: true,
                startsAt: true,
                state: true,
                transitions: {
                  where: {
                    trigger: "EVENT_META",
                  },
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: 1,
                  select: {
                    reason: true,
                  },
                },
              },
            })
          : null,
      ]);
      const eventMeta = await parseEventMeta(assignedEvent?.transitions[0]?.reason ?? null);
      const photoUrls = vehicle.media
        .filter((item) => item.type === "PHOTO")
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => item.url);

      await reply.code(200).send({
        vehicle: {
          id: vehicle.id,
          label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          mileage: vehicle.mileage,
          vin: vehicle.vin,
          marketPriceAed: vehicle.marketPrice === null ? null : await toNumberValue(vehicle.marketPrice),
          status: await resolveVehicleStatus(
            latestAuction?.state ?? null,
            hasVehicleApprovalTransition(latestTransitions),
          ),
          photoUrls: photoUrls.length > 0 ? photoUrls : vehicle.images,
          mulkiyaFrontUrl: vehicle.media.find((item) => item.type === "MULKIYA_FRONT")?.url ?? null,
          mulkiyaBackUrl: vehicle.media.find((item) => item.type === "MULKIYA_BACK")?.url ?? null,
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
          company: company
            ? {
                id: company.id,
                name: company.name,
                status: company.status,
              }
            : null,
          latestAuction: latestAuction
            ? {
                id: latestAuction.id,
                state: latestAuction.state,
                startsAt: latestAuction.startsAt.toISOString(),
                endsAt: latestAuction.endsAt.toISOString(),
                inspectionDropoffDate: latestAuction.inspectionDropoffDate?.toISOString() ?? null,
                viewingEndsAt: latestAuction.viewingEndsAt?.toISOString() ?? null,
                auctionStartsAt: latestAuction.auctionStartsAt?.toISOString() ?? null,
                auctionEndsAt: latestAuction.auctionEndsAt?.toISOString() ?? null,
                currentPriceAed: await toNumberValue(latestAuction.currentPrice),
                startingPriceAed: await toNumberValue(latestAuction.startingPrice),
                buyNowPriceAed:
                  latestAuction.buyNowPrice === null ? null : await toNumberValue(latestAuction.buyNowPrice),
                minIncrementAed: await toNumberValue(latestAuction.minIncrement),
              }
            : null,
          assignedEvent: assignedEvent
            ? {
                id: assignedEvent.id,
                title: eventMeta.title?.trim() || `Auction Event ${assignedEvent.id.slice(0, 8).toUpperCase()}`,
                status: assignedEvent.state,
                startsAt: assignedEvent.startsAt.toISOString(),
              }
            : null,
        },
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
            where: {
              transitions: {
                none: {
                  trigger: "EVENT_META",
                },
              },
            },
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
        await tx.auctionStateTransition.create({
          data: {
            auctionId: latestAuction.id,
            fromState: latestAuction.state,
            toState: latestAuction.state,
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
            nextState: latestAuction.state,
          },
        });
      });

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/admin/vehicles/:id/set-market-price",
    async function setAdminVehicleMarketPriceHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = companyIdParamsSchema.safeParse(request.params);
      const parsedBody = setMarketPriceSchema.safeParse(request.body ?? {});

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
      const vehicle = await prisma.vehicle.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          marketPrice: true,
        },
      });

      if (!vehicle) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.vehicle.update({
          where: {
            id,
          },
          data: {
            marketPrice: parsedBody.data.priceAed,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "VEHICLE_MARKET_PRICE_SET",
          entityType: "Vehicle",
          entityId: id,
          payload: {
            vehicleId: id,
            previousMarketPrice:
              vehicle.marketPrice === null ? null : await toNumberValue(vehicle.marketPrice),
            nextMarketPrice: parsedBody.data.priceAed,
          },
        });
      });

      await reply.code(200).send({
        success: true,
        vehicleId: id,
        marketPriceAed: parsedBody.data.priceAed,
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/admin/vehicles/:id/assign-event",
    async function assignAdminVehicleEventHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = companyIdParamsSchema.safeParse(request.params);
      const parsedBody = assignVehicleEventSchema.safeParse(request.body ?? {});

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
      const assignment = await assignVehicleToEvent({
        actorId,
        vehicleId: id,
        eventId: parsedBody.data.eventId ?? null,
      });

      if (!assignment.ok) {
        await reply.code(assignment.statusCode).send(assignment.body);
        return;
      }

      await reply.code(200).send({
        success: true,
        vehicleId: id,
        eventId: assignment.eventId,
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
            where: {
              transitions: {
                none: {
                  trigger: "EVENT_META",
                },
              },
            },
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

  fastify.get("/admin/companies", async function getCompaniesHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    void request;

    const companies = await prisma.company.findMany({
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    await reply.code(200).send({
      companies: companies.filter(isSellerCompany).map(mapAdminCompany),
    });
  });

  fastify.get<{ Params: { id: string } }>(
    "/admin/companies/:id",
    async function getCompanyDetailHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = companyIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const company = await prisma.company.findUnique({
        where: {
          id: parsedParams.data.id,
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
                  role: true,
                  status: true,
                  kycVerified: true,
                  emirate: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (!company || !isSellerCompany(company)) {
        await reply.code(404).send({
          error: "COMPANY_NOT_FOUND",
        });
        return;
      }

      const recentAuctions = await prisma.auction.findMany({
        where: {
          sellerCompanyId: company.id,
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          state: true,
          startsAt: true,
          endsAt: true,
          startingPrice: true,
          buyNowPrice: true,
          transitions: {
            where: {
              trigger: "ADMIN_VEHICLE_APPROVED",
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              trigger: true,
              reason: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              brand: true,
              model: true,
              year: true,
            },
          },
        },
      });

      await reply.code(200).send({
        company: {
          id: company.id,
          name: company.name,
          country: company.country,
          phone: company.phone?.trim() || null,
          registrationNumber: company.registrationNumber,
          status: company.status,
          createdAt: company.createdAt.toISOString(),
          members: company.users.map((membership) => ({
            id: membership.user.id,
            email: membership.user.email,
            role: membership.role,
            accountRole: membership.user.role,
            status: membership.user.status,
            city: membership.user.emirate,
            createdAt: membership.user.createdAt.toISOString(),
            kycVerified: membership.user.kycVerified,
          })),
          recentVehicles: await Promise.all(
            recentAuctions.map(async (auction) => ({
              auctionId: auction.id,
              vehicleId: auction.vehicle.id,
              label: `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}`,
              status: await resolveVehicleStatus(auction.state, hasVehicleApprovalTransition(auction.transitions)),
              startsAt: auction.startsAt.toISOString(),
              endsAt: auction.endsAt.toISOString(),
              startingPriceAed: await toNumberValue(auction.startingPrice),
              buyNowPriceAed: auction.buyNowPrice === null ? null : await toNumberValue(auction.buyNowPrice),
            })),
          ),
        },
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
      companies: companies.filter(isSellerCompany).map(mapAdminCompany),
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

        const approvedUserIds = company.users.map((link) => link.userId);

        if (approvedUserIds.length > 0) {
          await tx.user.updateMany({
            where: {
              id: {
                in: approvedUserIds,
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
            approvedUserIds,
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
            status?:
              | "PENDING_APPROVAL"
              | "BLOCKED"
              | "ACTIVE"
              | "REJECTED"
              | { in: Array<"PENDING_APPROVAL" | "BLOCKED" | "REJECTED"> };
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
            in: ["PENDING_APPROVAL", "BLOCKED", "REJECTED"],
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
                  phone: true,
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
          users.map(async (user) => {
            const walletBalance = user.wallet?.balance == null ? 0 : await toNumberValue(user.wallet.balance);

            return {
              id: user.id,
              email: user.email,
              role: user.role,
              status: user.status,
              kycVerified: user.kycVerified,
              walletBalance,
              hasDeposit: walletBalance > 0,
              createdAt: user.createdAt.toISOString(),
              companyUsers: user.companyUsers.map((membership) => ({
                id: membership.id,
                role: membership.role,
                companyId: membership.company.id,
                companyName: membership.company.name,
                companyPhone: membership.company.phone ?? null,
                companyStatus: membership.company.status,
              })),
            };
          }),
        ),
      });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/admin/users/:id",
    async function getUserDetailHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = userIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const user = await prisma.user.findUnique({
        where: {
          id: parsedParams.data.id,
        },
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
                  country: true,
                  phone: true,
                  registrationNumber: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      const walletBalanceAed = user.wallet?.balance == null ? 0 : await toNumberValue(user.wallet.balance);
      const depositStatus =
        user.status === "REJECTED"
          ? "REJECTED"
          : user.kycVerified
            ? "APPROVED"
            : walletBalanceAed > 0
              ? "PENDING"
              : "NONE";

      await reply.code(200).send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          kycVerified: user.kycVerified,
          city: user.emirate,
          createdAt: user.createdAt.toISOString(),
          walletBalanceAed,
          depositStatus,
          linkedCompanies: user.companyUsers.map((membership) => ({
            id: membership.company.id,
            name: membership.company.name,
            country: membership.company.country,
            phone: membership.company.phone?.trim() || null,
            registrationNumber: membership.company.registrationNumber,
            status: membership.company.status,
            createdAt: membership.company.createdAt.toISOString(),
            membershipRole: membership.role,
          })),
        },
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/admin/users/:id/approve",
    async function approveUserHandler(
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
      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: {
            id,
          },
          select: {
            id: true,
            role: true,
            status: true,
            companyUsers: {
              where: {
                role: "BUYER_BIDDER",
              },
              select: {
                companyId: true,
              },
            },
          },
        });

        if (!user) {
          return false;
        }

        if (user.role !== "BUYER") {
          return "NOT_A_BUYER" as const;
        }

        await tx.user.update({
          where: {
            id,
          },
          data: {
            status: "ACTIVE",
          },
        });

        const companyIds = user.companyUsers.map((membership) => membership.companyId);

        if (companyIds.length > 0) {
          await tx.company.updateMany({
            where: {
              id: {
                in: companyIds,
              },
            },
            data: {
              status: "ACTIVE",
            },
          });
        }

        await createAuditLog(tx, {
          actorId,
          action: "BUYER_APPROVED",
          entityType: "User",
          entityId: id,
          payload: {
            userId: id,
            status: "ACTIVE",
            companyIds,
          },
        });

        return true;
      });

      if (!updated) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      if (updated === "NOT_A_BUYER") {
        await reply.code(400).send({
          error: "NOT_A_BUYER",
        });
        return;
      }

      await reply.code(200).send({
        userId: id,
        status: "ACTIVE",
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/admin/users/:id/reject",
    async function rejectUserHandler(
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
      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: {
            id,
          },
          select: {
            id: true,
            role: true,
            companyUsers: {
              where: {
                role: "BUYER_BIDDER",
              },
              select: {
                companyId: true,
              },
            },
          },
        });

        if (!user) {
          return false;
        }

        if (user.role !== "BUYER") {
          return "NOT_A_BUYER" as const;
        }

        await tx.user.update({
          where: {
            id,
          },
          data: {
            status: "REJECTED",
          },
        });

        const companyIds = user.companyUsers.map((membership) => membership.companyId);

        if (companyIds.length > 0) {
          await tx.company.updateMany({
            where: {
              id: {
                in: companyIds,
              },
            },
            data: {
              status: "REJECTED",
            },
          });
        }

        await createAuditLog(tx, {
          actorId,
          action: "BUYER_REJECTED",
          entityType: "User",
          entityId: id,
          payload: {
            userId: id,
            status: "REJECTED",
            companyIds,
          },
        });

        return true;
      });

      if (!updated) {
        await reply.code(404).send({
          error: "USER_NOT_FOUND",
        });
        return;
      }

      if (updated === "NOT_A_BUYER") {
        await reply.code(400).send({
          error: "NOT_A_BUYER",
        });
        return;
      }

      await reply.code(200).send({
        userId: id,
        status: "REJECTED",
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
      const where: Prisma.AuctionEventWhereInput =
        rawStatus === "SCHEDULED" || rawStatus === "LIVE" || rawStatus === "CLOSED"
          ? {
              state: rawStatus,
            }
          : {};

      const events = await prisma.auctionEvent.findMany({
        where,
        select: {
          id: true,
          title: true,
          state: true,
          scheduledAt: true,
          startsAt: true,
          endsAt: true,
          lots: {
            select: {
              id: true,
            },
          },
        },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      });

      await reply.code(200).send({
        events: events.map((event) => ({
          id: event.id,
          title: event.title,
          scheduledAt: event.scheduledAt.toISOString(),
          startsAt: (event.startsAt ?? event.scheduledAt).toISOString(),
          endsAt: event.endsAt?.toISOString() ?? null,
          state: event.state,
          status: event.state,
          lotsCount: event.lots.length,
        })),
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

    const startTime = parsedBody.data.startTime ?? parsedBody.data.time ?? "00:00";
    const startsAt = parsedBody.data.scheduledAt
      ? new Date(parsedBody.data.scheduledAt)
      : new Date(`${parsedBody.data.date}T${startTime}:00+04:00`);

    if (Number.isNaN(startsAt.getTime())) {
      await reply.code(400).send({
        error: "INVALID_EVENT_DATE",
      });
      return;
    }

    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

    const createdEvent = await prisma.$transaction(async (tx) => {
      const event = await tx.auctionEvent.create({
        data: {
          title: parsedBody.data.title,
          scheduledAt: startsAt,
          state: "SCHEDULED",
        },
      });

      await createAuditLog(tx, {
        actorId,
        action: "EVENT_CREATED",
        entityType: "Event",
        entityId: event.id,
        payload: {
          eventId: event.id,
          title: parsedBody.data.title,
          date: parsedBody.data.date ?? startsAt.toISOString().slice(0, 10),
          time: startTime,
          description: parsedBody.data.description ?? "",
        },
      });

      return event;
    });

    const activeUsers = await prisma.user.findMany({
      where: {
        role: {
          in: ["BUYER", "SELLER"],
        },
        status: "ACTIVE",
      },
      select: {
        email: true,
      },
    });

    await sendNewEventAnnouncementEmail(
      {
        description: parsedBody.data.description ?? "",
        endsAt,
        eventId: createdEvent.id,
        recipients: activeUsers.map((user) => user.email),
        startsAt,
        title: parsedBody.data.title,
      },
      fastify.log,
    );

    await reply.code(201).send({
      id: createdEvent.id,
      success: true,
      event: {
        id: createdEvent.id,
        title: parsedBody.data.title,
        scheduledAt: startsAt.toISOString(),
        state: "SCHEDULED",
      },
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
      select: {
        id: true,
        state: true,
        startsAt: true,
        endsAt: true,
        transitions: {
          where: {
            trigger: {
              in: ["EVENT_META", "EVENT_ORDER"],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            trigger: true,
            reason: true,
            createdAt: true,
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
        id: {
          not: event.id,
        },
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
          marketPriceAed: lot.vehicle.marketPrice === null ? null : await toNumberValue(lot.vehicle.marketPrice),
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

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/admin/events/:id/reorder",
    async function reorderAdminEventLotsHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = eventIdParamsSchema.safeParse(request.params);
      const parsedBody = eventOrderSchema.safeParse(request.body ?? {});

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

      const event = await prisma.auction.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        select: {
          id: true,
          state: true,
        },
      });

      if (!event) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.auctionStateTransition.create({
          data: {
            auctionId: event.id,
            fromState: event.state,
            toState: event.state,
            trigger: "EVENT_ORDER",
            actorId,
            reason: JSON.stringify({
              vehicleIds: parsedBody.data.vehicleIds,
            }),
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "EVENT_REORDERED",
          entityType: "Event",
          entityId: event.id,
          payload: {
            eventId: event.id,
            vehicleIds: parsedBody.data.vehicleIds,
          },
        });
      });

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/admin/events/:id/add-vehicle",
    async function addVehicleToAdminEventHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = eventIdParamsSchema.safeParse(request.params);
      const parsedBody = eventVehicleSchema.safeParse(request.body ?? {});

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

      const event = await prisma.auction.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        select: {
          id: true,
        },
      });

      if (!event) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      const assignment = await assignVehicleToEvent({
        actorId,
        vehicleId: parsedBody.data.vehicleId,
        eventId: event.id,
      });

      if (!assignment.ok) {
        await reply.code(assignment.statusCode).send(assignment.body);
        return;
      }

      await reply.code(200).send({
        success: true,
        vehicleId: parsedBody.data.vehicleId,
        eventId: event.id,
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/admin/events/:id/remove-vehicle",
    async function removeVehicleFromAdminEventHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const actorId = request.auth?.userId;
      const parsedParams = eventIdParamsSchema.safeParse(request.params);
      const parsedBody = eventVehicleSchema.safeParse(request.body ?? {});

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

      const event = await prisma.auction.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        select: {
          id: true,
        },
      });

      if (!event) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      const assignment = await assignVehicleToEvent({
        actorId,
        vehicleId: parsedBody.data.vehicleId,
        eventId: null,
      });

      if (!assignment.ok) {
        await reply.code(assignment.statusCode).send(assignment.body);
        return;
      }

      await reply.code(200).send({
        success: true,
        vehicleId: parsedBody.data.vehicleId,
        eventId: assignment.eventId,
      });
    },
  );

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
