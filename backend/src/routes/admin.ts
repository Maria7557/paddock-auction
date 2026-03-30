import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import { requireAdminAuth } from "../lib/auth";
import {
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendDepositApprovedEmail,
  sendNewEventAnnouncementEmail,
  sendVehicleApprovedEmail,
} from "../lib/email";
import { releaseWinnerBidAfterPayment } from "../modules/deposits/application/deposit_commands";
import {
  buildInvoicePdfHtml,
  formatInvoiceAmount,
  formatInvoiceDate,
  formatInvoiceDateTime,
  renderInvoicePdf,
} from "./finance";
import {
  evaluateVipAccess,
  readTrustedCurrentTime,
  type VipRequestActorBase,
} from "../lib/vip-early-access";

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

type LockedCompanyDepositWalletRow = {
  id: string;
  available_balance: Prisma.Decimal;
  locked_balance: Prisma.Decimal;
};

type LockedCompanyDepositLockRow = {
  id: string;
  amount: Prisma.Decimal;
  status: "ACTIVE" | "RELEASED" | "BURNED";
  created_at: Date;
};

type EventMeta = {
  title?: string;
  description?: string;
};

type EventOrder = {
  vehicleIds?: string[];
};

type VipAccessPolicyValue = "NONE" | "VIP_EARLY_ACCESS_24H" | "UNDETERMINED_RESTRICTED";

type VipApprovalWritesMode = "DISABLED" | "ENABLED" | "UNDETERMINED";

type VipApprovalMetadata = {
  approvedAt: Date;
  vipAccessPolicy: VipAccessPolicyValue;
  vipReleaseAt: Date | null;
  vipPolicyReason: string | null;
};

type CurrentTimeRow = {
  currentTime: Date;
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

const DEFAULT_ADMIN_APPROVAL_AUCTION_MIN_INCREMENT = 500;

const adminVehicleQuerySchema = z.object({
  status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"]).optional(),
  unassigned: z.enum(["true", "false"]).optional(),
});

const adminVehicleUpdateSchema = z.object({
  photoUrls: z.array(z.string().trim().min(1)).optional(),
  images: z.array(z.string().trim().min(1)).optional(),
  mulkiyaFrontUrl: z.string().trim().min(1).nullable().optional(),
  mulkiyaBackUrl: z.string().trim().min(1).nullable().optional(),
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().min(1886).max(2100).optional(),
  series: z.string().trim().min(1).nullable().optional(),
  mileage: z.coerce.number().int().nonnegative().optional(),
  vin: z.string().trim().min(5).max(64).optional(),
  cylinders: z.coerce.number().int().nonnegative().nullable().optional(),
  fuelType: z.string().trim().min(1).nullable().optional(),
  transmission: z.string().trim().min(1).nullable().optional(),
  bodyType: z.string().trim().min(1).nullable().optional(),
  regionSpec: z.string().trim().min(1).nullable().optional(),
  serviceHistory: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().min(1).nullable().optional(),
  engine: z.string().trim().min(1).nullable().optional(),
  driveType: z.string().trim().min(1).nullable().optional(),
  exteriorColor: z.string().trim().min(1).nullable().optional(),
  interiorColor: z.string().trim().min(1).nullable().optional(),
  manufacturedIn: z.string().trim().min(1).nullable().optional(),
  numberOfKeys: z.coerce.number().int().nonnegative().nullable().optional(),
  warrantyStatus: z.string().trim().min(1).nullable().optional(),
  startCode: z.string().trim().min(1).nullable().optional(),
  airbags: z.string().trim().min(1).nullable().optional(),
  damage: z.string().trim().min(1).nullable().optional(),
  damageMap: z.record(z.string(), z.unknown()).nullable().optional(),
  conditionGrade: z.string().trim().min(1).nullable().optional(),
  estimatedValueAed: z.coerce.number().nonnegative().nullable().optional(),
  titleStatus: z.string().trim().min(1).nullable().optional(),
  primaryDamage: z.string().trim().min(1).nullable().optional(),
  lossType: z.string().trim().min(1).nullable().optional(),
  tireCondition: z.coerce.number().min(0).max(100).nullable().optional(),
  internalNotes: z.string().trim().min(1).nullable().optional(),
  features: z.record(z.string(), z.unknown()).nullable().optional(),
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

const invoiceStatusSchema = z.enum([
  "ISSUED",
  "PAID_PENDING_CONFIRMATION",
  "PAID",
  "DEFAULTED",
  "CANCELED",
]);

const adminInvoiceQuerySchema = z.object({
  status: invoiceStatusSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const invoiceIdParamsSchema = z.object({
  invoiceId: z.string().trim().min(1),
});

const auctionIdParamsSchema = z.object({
  auctionId: z.string().trim().min(1),
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

async function normalizeVin(vin: string): Promise<string> {
  return vin.trim().toUpperCase();
}

async function toVehicleMediaCreateInput(input: {
  images: string[];
  mulkiyaFrontUrl?: string | null;
  mulkiyaBackUrl?: string | null;
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

function buildAdminLotTitle(
  brand: string | null | undefined,
  model: string | null | undefined,
  year: number | null | undefined,
  fallbackId: string,
): string {
  const parts = [brand?.trim(), model?.trim(), typeof year === "number" ? String(year) : null].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return `Lot ${fallbackId.slice(0, 8).toUpperCase()}`;
}

function resolveInvoiceUrgency(
  dueAt: Date,
  now: Date,
): "normal" | "warning" | "critical" {
  const diffMs = dueAt.getTime() - now.getTime();

  if (diffMs <= 12 * 60 * 60 * 1000) {
    return "critical";
  }

  if (diffMs <= 24 * 60 * 60 * 1000) {
    return "warning";
  }

  return "normal";
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

async function resolveVipApprovalWritesMode(): Promise<VipApprovalWritesMode> {
  const rawValue = process.env.VIP_EARLY_ACCESS_APPROVAL_WRITES_ENABLED?.trim().toUpperCase();

  if (rawValue === "TRUE" || rawValue === "1" || rawValue === "ENABLED") {
    return "ENABLED";
  }

  if (rawValue === "UNDETERMINED" || rawValue === "RESTRICTED") {
    return "UNDETERMINED";
  }

  return "DISABLED";
}

async function addHours(input: Date, hours: number): Promise<Date> {
  return new Date(input.getTime() + hours * 60 * 60 * 1000);
}

async function createVipApprovalMetadata(approvalAt: Date): Promise<VipApprovalMetadata> {
  const writesMode = await resolveVipApprovalWritesMode();

  if (writesMode === "ENABLED") {
    return {
      approvedAt: approvalAt,
      vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
      vipReleaseAt: await addHours(approvalAt, 24),
      vipPolicyReason: "feature_enabled",
    };
  }

  if (writesMode === "UNDETERMINED") {
    return {
      approvedAt: approvalAt,
      vipAccessPolicy: "UNDETERMINED_RESTRICTED",
      vipReleaseAt: await addHours(approvalAt, 24),
      vipPolicyReason: "rollout_undetermined_fail_closed",
    };
  }

  return {
    approvedAt: approvalAt,
    vipAccessPolicy: "NONE",
    vipReleaseAt: null,
    vipPolicyReason: "approval_writes_disabled",
  };
}

async function readDatabaseCurrentTime(tx: {
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
}): Promise<Date> {
  const rows = await tx.$queryRaw<CurrentTimeRow[]>`SELECT CURRENT_TIMESTAMP as "currentTime"`;
  const currentTime = rows[0]?.currentTime;

  if (!(currentTime instanceof Date) || Number.isNaN(currentTime.getTime())) {
    throw new Error("Unable to resolve authoritative database time");
  }

  return currentTime;
}

async function readAdminVehicleDetail(
  vehicleId: string,
  actorUserId: string | null | undefined,
): Promise<{
  vehicle: {
    id: string;
    label: string;
    brand: string;
    model: string;
    year: number;
    series: string | null;
    mileage: number;
    vin: string;
    marketPriceAed: number | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    photoUrls: string[];
    mulkiyaFrontUrl: string | null;
    mulkiyaBackUrl: string | null;
    fuelType: string | null;
    transmission: string | null;
    bodyType: string | null;
    regionSpec: string | null;
    condition: string | null;
    serviceHistory: string | null;
    description: string | null;
    internalNotes: string | null;
    engine: string | null;
    driveType: string | null;
    exteriorColor: string | null;
    interiorColor: string | null;
    manufacturedIn: string | null;
    airbags: string | null;
    damage: string | null;
    damageMap: Prisma.JsonValue | null;
    features: JsonRecord | null;
    startCode: string | null;
    numberOfKeys: number | null;
    warrantyStatus: string | null;
    cylinders: number | null;
    conditionGrade: string | null;
    estimatedValueAed: number | null;
    titleStatus: string | null;
    primaryDamage: string | null;
    lossType: string | null;
    tireCondition: number | null;
    company: {
      id: string;
      name: string;
      status: string;
    } | null;
    latestAuction: {
      id: string;
      state: string;
      startsAt: string;
      endsAt: string;
      inspectionDropoffDate: string | null;
      viewingEndsAt: string | null;
      auctionStartsAt: string | null;
      auctionEndsAt: string | null;
      approvalStatusLabel?: string | null;
      currentPriceAed: number;
      startingPriceAed: number;
      buyNowPriceAed: number | null;
      minIncrementAed: number;
    } | null;
    assignedEvent: {
      id: string;
      title: string;
      status: string;
      startsAt: string;
    } | null;
  };
} | null> {
  const [now, vehicle, latestAdminUpdateLog] = await Promise.all([
    readTrustedCurrentTime(prisma),
    prisma.vehicle.findUnique({
      where: {
        id: vehicleId,
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
            approvedAt: true,
            vipAccessPolicy: true,
            vipReleaseAt: true,
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
    }),
    prisma.auditLog.findFirst({
      where: {
        action: "ADMIN_VEHICLE_UPDATED",
        entityType: "Vehicle",
        entityId: vehicleId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        payload: true,
      },
    }),
  ]);

  if (!vehicle) {
    return null;
  }

  const latestAuction = vehicle.auctions[0] ?? null;
  const latestTransitions = latestAuction?.transitions ?? [];
  const latestUpdatePayload = readJsonRecord(latestAdminUpdateLog?.payload);
  const latestChanges = readJsonRecord((latestUpdatePayload?.changes ?? null) as Prisma.JsonValue | null);
  const featureOverrides = readJsonRecord((latestChanges?.features ?? null) as Prisma.JsonValue | null);
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

  return {
    vehicle: {
      id: vehicle.id,
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      series: readJsonString(latestChanges, "series"),
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
      internalNotes: null,
      engine: vehicle.engine,
      driveType: vehicle.driveType,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      manufacturedIn: readJsonString(latestChanges, "manufacturedIn"),
      airbags: vehicle.airbags,
      damage: vehicle.damage,
      damageMap: vehicle.damageMap,
      features: featureOverrides,
      startCode: readJsonString(latestChanges, "startCode"),
      numberOfKeys: readJsonNumber(latestChanges, "numberOfKeys"),
      warrantyStatus: readJsonString(latestChanges, "warrantyStatus"),
      cylinders: readJsonNumber(latestChanges, "cylinders"),
      conditionGrade: readJsonString(latestChanges, "conditionGrade"),
      estimatedValueAed: readJsonNumber(latestChanges, "estimatedValueAed"),
      titleStatus: readJsonString(latestChanges, "titleStatus"),
      primaryDamage: readJsonString(latestChanges, "primaryDamage"),
      lossType: readJsonString(latestChanges, "lossType"),
      tireCondition: readJsonNumber(latestChanges, "tireCondition"),
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
            approvalStatusLabel: evaluateVipAccess({
              actorBase: createAdminActorBase(actorUserId),
              snapshot: {
                approvedAt: latestAuction.approvedAt,
                vipAccessPolicy: latestAuction.vipAccessPolicy,
                vipReleaseAt: latestAuction.vipReleaseAt,
                sellerCompanyId: latestAuction.sellerCompanyId,
              },
              now,
            }).sellerAdminStatusText,
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
  };
}

function isSchemaDriftPrismaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

function readJsonRecord(value: Prisma.JsonValue | null | undefined): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function readJsonString(record: JsonRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readJsonNumber(record: JsonRecord | null, key: string): number | null {
  const value = record?.[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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
  latestAuctionApprovedAt: Date | null;
  latestAuctionVipAccessPolicy: string | null;
  latestAuctionVipReleaseAt: Date | null;
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
            approvedAt: true,
            vipAccessPolicy: true,
            vipReleaseAt: true,
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
      latestAuctionApprovedAt: vehicle.auctions[0]?.approvedAt ?? null,
      latestAuctionVipAccessPolicy: vehicle.auctions[0]?.vipAccessPolicy ?? null,
      latestAuctionVipReleaseAt: vehicle.auctions[0]?.vipReleaseAt ?? null,
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
            approvedAt: true,
            vipAccessPolicy: true,
            vipReleaseAt: true,
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
      marketPrice: null,
      imageUrl: null,
      latestAuctionId: vehicle.auctions[0]?.id ?? null,
      latestAuctionState: vehicle.auctions[0]?.state ?? null,
      sellerCompanyId: vehicle.auctions[0]?.sellerCompanyId ?? null,
      latestTransitions: vehicle.auctions[0]?.transitions ?? [],
      latestAuctionApprovedAt: null,
      latestAuctionVipAccessPolicy: null,
      latestAuctionVipReleaseAt: null,
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

function createAdminActorBase(userId: string | null | undefined): VipRequestActorBase {
  return {
    userId: userId?.trim() || null,
    companyId: null,
    role: "ADMIN",
    buyerContext: null,
  };
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
      const [now, vehicles] = await Promise.all([
        readTrustedCurrentTime(prisma),
        loadAdminVehicleListRows(),
      ]);
      const actorBase = createAdminActorBase(request.auth?.userId);

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
          approvalStatusLabel: evaluateVipAccess({
            actorBase,
            snapshot: {
              approvedAt: vehicle.latestAuctionApprovedAt,
              vipAccessPolicy: vehicle.latestAuctionVipAccessPolicy,
              vipReleaseAt: vehicle.latestAuctionVipReleaseAt,
              sellerCompanyId: vehicle.sellerCompanyId,
            },
            now,
          }).sellerAdminStatusText,
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

      const detail = await readAdminVehicleDetail(parsedParams.data.id, request.auth?.userId);

      if (!detail) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      await reply.code(200).send(detail);
    },
  );

  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    "/admin/vehicles/:id",
    async function updateAdminVehicleHandler(
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
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

      const parsedBody = adminVehicleUpdateSchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(reply, await mapZodIssues(parsedBody.error.issues));
        return;
      }

      const { id } = parsedParams.data;
      const payload = parsedBody.data;
      const existingVehicle = await prisma.vehicle.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          images: true,
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

      if (!existingVehicle) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      const latestAuction = existingVehicle.auctions[0] ?? null;

      if (latestAuction && latestAuction.state !== "DRAFT") {
        await reply.code(409).send({
          error: "VEHICLE_EDIT_LOCKED",
          message: "Vehicle can only be edited while linked auction is DRAFT",
        });
        return;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const images = payload.photoUrls ?? payload.images ?? existingVehicle.images ?? [];
          const mediaItems = await toVehicleMediaCreateInput({
            images,
            mulkiyaFrontUrl: payload.mulkiyaFrontUrl ?? undefined,
            mulkiyaBackUrl: payload.mulkiyaBackUrl ?? undefined,
          });
          const shouldRewriteMedia =
            payload.photoUrls !== undefined ||
            payload.images !== undefined ||
            payload.mulkiyaFrontUrl !== undefined ||
            payload.mulkiyaBackUrl !== undefined;

          await tx.vehicle.update({
            where: {
              id,
            },
            data: {
              brand: payload.brand,
              model: payload.model,
              year: payload.year,
              mileage: payload.mileage,
              vin: payload.vin === undefined ? undefined : await normalizeVin(payload.vin),
              fuelType: payload.fuelType === undefined ? undefined : payload.fuelType,
              transmission: payload.transmission === undefined ? undefined : payload.transmission,
              bodyType: payload.bodyType === undefined ? undefined : payload.bodyType,
              regionSpec: payload.regionSpec === undefined ? undefined : payload.regionSpec,
              serviceHistory: payload.serviceHistory === undefined ? undefined : payload.serviceHistory,
              description: payload.description === undefined ? undefined : payload.description,
              engine: payload.engine === undefined ? undefined : payload.engine,
              driveType: payload.driveType === undefined ? undefined : payload.driveType,
              exteriorColor: payload.exteriorColor === undefined ? undefined : payload.exteriorColor,
              interiorColor: payload.interiorColor === undefined ? undefined : payload.interiorColor,
              airbags: payload.airbags === undefined ? undefined : payload.airbags,
              damage: payload.damage === undefined ? undefined : payload.damage,
              damageMap: payload.damageMap === undefined ? undefined : await toStoredJson(payload.damageMap),
              images: shouldRewriteMedia ? images : undefined,
              media: shouldRewriteMedia
                ? {
                    deleteMany: {},
                    create: mediaItems,
                  }
                : undefined,
            },
          });

          await createAuditLog(tx, {
            actorId,
            action: "ADMIN_VEHICLE_UPDATED",
            entityType: "Vehicle",
            entityId: id,
            payload: {
              vehicleId: id,
              changes: payload,
            },
          });
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

      const detail = await readAdminVehicleDetail(id, actorId);

      if (!detail) {
        await reply.code(404).send({
          error: "VEHICLE_NOT_FOUND",
        });
        return;
      }

      await reply.code(200).send(detail);
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
              approvedAt: true,
              vipAccessPolicy: true,
              vipReleaseAt: true,
              approvedByUserId: true,
              vipPolicyReason: true,
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

      let latestAuction = vehicle.auctions[0] ?? null;

      if (!latestAuction) {
        const vehicleCreatedLog = await prisma.auditLog.findFirst({
          where: {
            entityType: "Vehicle",
            entityId: id,
            action: "SELLER_VEHICLE_CREATED",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            payload: true,
          },
        });
        const vehiclePayload = readJsonRecord(vehicleCreatedLog?.payload);
        const sellerCompanyId = readJsonString(vehiclePayload, "companyId");

        if (!sellerCompanyId) {
          await reply.code(409).send({
            error: "VEHICLE_OWNER_NOT_FOUND",
          });
          return;
        }

        const now = new Date();
        const draftEndsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const startingPrice = readJsonNumber(vehiclePayload, "startingPrice") ?? 0;
        const buyNowPrice = readJsonNumber(vehiclePayload, "buyNowPrice");
        const inspectionDropoffDateValue = readJsonString(vehiclePayload, "inspectionDropoffDate");
        const inspectionDropoffDate =
          inspectionDropoffDateValue && !Number.isNaN(Date.parse(inspectionDropoffDateValue))
            ? new Date(inspectionDropoffDateValue)
            : null;

        latestAuction = await prisma.$transaction(async (tx) => {
          const auction = await tx.auction.create({
            data: {
              vehicleId: id,
              sellerCompanyId,
              state: "DRAFT",
              startsAt: now,
              endsAt: draftEndsAt,
              inspectionDropoffDate,
              viewingEndsAt: null,
              auctionStartsAt: null,
              auctionEndsAt: null,
              startingPrice,
              currentPrice: startingPrice,
              buyNowPrice,
              minIncrement: DEFAULT_ADMIN_APPROVAL_AUCTION_MIN_INCREMENT,
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
                sellerCompanyId,
                vehicleId: id,
                source: "ADMIN_VEHICLE_APPROVE",
              }),
            },
          });

          return {
            id: auction.id,
            state: auction.state,
            approvedAt: null,
            vipAccessPolicy: "NONE" as const,
            vipReleaseAt: null,
            approvedByUserId: null,
            vipPolicyReason: null,
          };
        });
      }

      if (latestAuction.state !== "DRAFT" || latestAuction.approvedAt) {
        await reply.code(200).send({
          success: true,
        });
        return;
      }

      let vipApprovalMetadata: VipApprovalMetadata | null = null;

      await prisma.$transaction(async (tx) => {
        const approvalTimestamp = await readDatabaseCurrentTime(tx as {
          $queryRaw: <T = unknown>(
            query: TemplateStringsArray,
            ...values: unknown[]
          ) => Promise<T>;
        });
        vipApprovalMetadata = await createVipApprovalMetadata(approvalTimestamp);

        await tx.auction.update({
          where: {
            id: latestAuction.id,
          },
          data: {
            state: "SCHEDULED",
            approvedAt: vipApprovalMetadata.approvedAt,
            vipAccessPolicy: vipApprovalMetadata.vipAccessPolicy,
            vipReleaseAt: vipApprovalMetadata.vipReleaseAt,
            approvedByUserId: actorId,
            vipPolicyReason: vipApprovalMetadata.vipPolicyReason,
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
            approvedAt: vipApprovalMetadata.approvedAt.toISOString(),
            vipAccessPolicy: vipApprovalMetadata.vipAccessPolicy,
            vipReleaseAt: vipApprovalMetadata.vipReleaseAt?.toISOString() ?? null,
            vipPolicyReason: vipApprovalMetadata.vipPolicyReason,
          },
        });
      });

      await reply.code(200).send({
        success: true,
      });

      void (async () => {
        try {
          const approvedVehicle = await prisma.vehicle.findUnique({
            where: { id },
            select: {
              brand: true,
              model: true,
              year: true,
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
                  startsAt: true,
                  sellerCompanyId: true,
                },
              },
            },
          });

          const vehicleAuction = approvedVehicle?.auctions[0];

          if (!vehicleAuction) {
            return;
          }

          const sellerUsers = await prisma.companyUser.findMany({
            where: {
              companyId: vehicleAuction.sellerCompanyId,
              role: "SELLER_MANAGER",
            },
            select: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          });

          const vehicleTitle = approvedVehicle
            ? `${approvedVehicle.brand} ${approvedVehicle.model} ${approvedVehicle.year}`
            : id;

          for (const sellerUser of sellerUsers) {
            void sendVehicleApprovedEmail(
              {
                email: sellerUser.user.email,
                name: sellerUser.user.email,
                vehicleTitle,
                auctionDate: vehicleAuction.startsAt,
                auctionId: vehicleAuction.id,
              },
              fastify.log,
            );
          }
        } catch {
          // Fire-and-forget email dispatch must never affect the approval flow.
        }
      })();
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

  fastify.patch<{ Params: { id: string } }>(
    "/admin/auctions/:id/relist",
    async function relistAdminAuctionHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = companyIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const auction = await prisma.auction.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        select: {
          id: true,
          state: true,
        },
      });

      if (!auction) {
        await reply.code(404).send({
          error: "AUCTION_NOT_FOUND",
        });
        return;
      }

      if (auction.state !== "ENDED") {
        await reply.code(409).send({
          error: "AUCTION_NOT_RELISTABLE",
        });
        return;
      }

      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.auctionEventLot.deleteMany({
          where: {
            auctionId: auction.id,
          },
        });

        await tx.auction.update({
          where: {
            id: auction.id,
          },
          data: {
            state: "DRAFT",
            startsAt,
            endsAt,
            auctionStartsAt: null,
            auctionEndsAt: null,
            winnerCompanyId: null,
            closedAt: null,
          },
        });

        await tx.auctionStateTransition.create({
          data: {
            auctionId: auction.id,
            fromState: "ENDED",
            toState: "DRAFT",
            trigger: "RELISTED",
            actorId: request.auth?.userId ?? "system",
          },
        });
      });

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.get<{ Querystring: { status?: string; page?: string; limit?: string } }>(
    "/admin/invoices",
    async function getAdminInvoicesHandler(
      request: FastifyRequest<{ Querystring: { status?: string; page?: string; limit?: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedQuery = adminInvoiceQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(reply, await mapZodIssues(parsedQuery.error.issues));
        return;
      }

      const status = parsedQuery.data.status;
      const page = parsedQuery.data.page ?? 1;
      const limit = parsedQuery.data.limit ?? 50;
      const where = status ? { status } : undefined;

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            auctionId: true,
            buyerCompanyId: true,
            sellerCompanyId: true,
            subtotal: true,
            commission: true,
            vat: true,
            total: true,
            status: true,
            issuedAt: true,
            dueAt: true,
            paidAt: true,
            auction: {
              select: {
                id: true,
                closedAt: true,
                vehicle: {
                  select: {
                    brand: true,
                    model: true,
                    year: true,
                  },
                },
              },
            },
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      const companyIds = Array.from(
        new Set(
          invoices.flatMap((invoice) => [invoice.sellerCompanyId, invoice.buyerCompanyId]).filter(
            (companyId): companyId is string => typeof companyId === "string" && companyId.length > 0,
          ),
        ),
      );
      const companies = companyIds.length
        ? await prisma.company.findMany({
            where: {
              id: {
                in: companyIds,
              },
            },
            select: {
              id: true,
              name: true,
              phone: true,
              registrationNumber: true,
              country: true,
            },
          })
        : [];
      const companyById = new Map(companies.map((company) => [company.id, company]));
      const now = new Date();

      await reply.code(200).send({
        invoices: await Promise.all(
          invoices.map(async (invoice) => {
            const subtotal = await toNumberValue(invoice.subtotal);
            const commission = await toNumberValue(invoice.commission);
            const vat = await toNumberValue(invoice.vat);
            const totalAmount = await toNumberValue(invoice.total);
            const commissionRate = subtotal > 0 ? Number((commission / subtotal).toFixed(4)) : 0;
            const seller = companyById.get(invoice.sellerCompanyId);
            const buyer = companyById.get(invoice.buyerCompanyId);

            return {
              id: invoice.id,
              auctionId: invoice.auctionId,
              lotTitle: buildAdminLotTitle(
                invoice.auction.vehicle?.brand,
                invoice.auction.vehicle?.model,
                invoice.auction.vehicle?.year,
                invoice.auction.id,
              ),
              auctionClosedAt: (invoice.auction.closedAt ?? invoice.issuedAt).toISOString(),
              subtotal,
              commission,
              commissionRate,
              vat,
              total: totalAmount,
              status: invoice.status,
              issuedAt: invoice.issuedAt.toISOString(),
              dueAt: invoice.dueAt.toISOString(),
              paidAt: invoice.paidAt?.toISOString() ?? null,
              urgency: resolveInvoiceUrgency(invoice.dueAt, now),
              seller: {
                companyId: invoice.sellerCompanyId,
                name: seller?.name ?? "Seller Company",
                phone: seller?.phone ?? null,
                registrationNumber: seller?.registrationNumber ?? "—",
                country: seller?.country ?? "—",
              },
              buyer: {
                companyId: invoice.buyerCompanyId,
                name: buyer?.name ?? "Buyer Company",
                phone: buyer?.phone ?? null,
                registrationNumber: buyer?.registrationNumber ?? "—",
                country: buyer?.country ?? "—",
              },
            };
          }),
        ),
        total,
      });
    },
  );

  fastify.get<{ Params: { invoiceId: string } }>(
    "/admin/invoices/:invoiceId/pdf",
    async function getAdminInvoicePdfHandler(
      request: FastifyRequest<{ Params: { invoiceId: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = invoiceIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
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
          subtotal: true,
          commission: true,
          vat: true,
          total: true,
          status: true,
          issuedAt: true,
          dueAt: true,
          auction: {
            select: {
              id: true,
              closedAt: true,
              endsAt: true,
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                  year: true,
                },
              },
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

      const buyerCompany = await prisma.company.findUnique({
        where: {
          id: invoice.buyerCompanyId,
        },
        select: {
          name: true,
        },
      });

      const subtotal = await toNumberValue(invoice.subtotal);
      const commission = await toNumberValue(invoice.commission);
      const vat = await toNumberValue(invoice.vat);
      const totalAmount = await toNumberValue(invoice.total);
      const invoiceNumber = invoice.id.slice(0, 8).toUpperCase();
      const normalizedStatus = invoice.status.trim().toUpperCase();
      const isPaid = normalizedStatus === "PAID" || normalizedStatus === "CONFIRMED";
      const closedAtSource = invoice.auction.closedAt ?? invoice.auction.endsAt ?? invoice.issuedAt;
      const html = buildInvoicePdfHtml({
        invoiceNumber,
        issuedAt: formatInvoiceDate(invoice.issuedAt),
        statusClass: isPaid ? "status-paid" : "status-pending",
        statusLabel: isPaid ? "Paid" : "Payment Pending",
        lotTitle: buildAdminLotTitle(
          invoice.auction.vehicle?.brand,
          invoice.auction.vehicle?.model,
          invoice.auction.vehicle?.year,
          invoice.auction.id,
        ),
        lotNumber: invoice.auctionId.slice(0, 8).toUpperCase(),
        closedAt: formatInvoiceDate(closedAtSource),
        subtotal: formatInvoiceAmount(subtotal),
        commissionPct: subtotal > 0 ? ((commission / subtotal) * 100).toFixed(0) : "0",
        commission: formatInvoiceAmount(commission),
        vat: formatInvoiceAmount(vat),
        total: formatInvoiceAmount(totalAmount),
        dueAt: formatInvoiceDateTime(invoice.dueAt),
        buyerCompanyName: buyerCompany?.name?.trim() || "Buyer Company",
        invoiceId: invoice.id,
      });
      const pdfBuffer = await renderInvoicePdf(html);

      await reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="invoice-${invoiceNumber}.pdf"`)
        .send(pdfBuffer);
    },
  );

  fastify.post<{ Params: { invoiceId: string } }>(
    "/admin/invoices/:invoiceId/confirm-payment",
    async function confirmAdminInvoicePaymentHandler(
      request: FastifyRequest<{ Params: { invoiceId: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = invoiceIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const actorId = request.auth?.userId ?? "system";
      const invoice = await prisma.invoice.findUnique({
        where: {
          id: parsedParams.data.invoiceId,
        },
        select: {
          id: true,
          auctionId: true,
          status: true,
          auction: {
            select: {
              state: true,
              winnerCompanyId: true,
              currentPrice: true,
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

      if (invoice.status === "PAID") {
        await reply.code(409).send({
          error: "INVOICE_ALREADY_PAID",
        });
        return;
      }

      if (invoice.status === "CANCELED") {
        await reply.code(409).send({
          error: "INVOICE_CANCELED",
        });
        return;
      }

      const paidAt = new Date();
      const winnerCompanyId = invoice.auction.winnerCompanyId?.trim() ?? null;

      if (!winnerCompanyId) {
        await reply.code(422).send({
          error: "INVOICE_AUCTION_HAS_NO_WINNER",
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: {
            id: invoice.id,
          },
          data: {
            status: "PAID",
            paidAt,
          },
        });

        await releaseWinnerBidAfterPayment(tx, winnerCompanyId, invoice.auction.currentPrice);

        await tx.auction.update({
          where: {
            id: invoice.auctionId,
          },
          data: {
            state: "PAID",
          },
        });

        await tx.auctionStateTransition.create({
          data: {
            auctionId: invoice.auctionId,
            fromState: invoice.auction.state,
            toState: "PAID",
            trigger: "ADMIN_PAYMENT_CONFIRMED",
            actorId,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "ADMIN_PAYMENT_CONFIRMED",
          entityType: "Invoice",
          entityId: invoice.id,
          correlationId: request.id,
          payload: {
            invoiceId: invoice.id,
            auctionId: invoice.auctionId,
            previousInvoiceStatus: invoice.status,
            nextInvoiceStatus: "PAID",
            previousAuctionState: invoice.auction.state,
            nextAuctionState: "PAID",
          },
        });
      });

      await reply.code(200).send({
        invoiceId: invoice.id,
        status: "PAID",
        paidAt: paidAt.toISOString(),
      });
    },
  );

  fastify.post<{ Params: { auctionId: string } }>(
    "/admin/auctions/:auctionId/relist",
    async function relistAdminInvoiceAuctionHandler(
      request: FastifyRequest<{ Params: { auctionId: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = auctionIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(reply, await mapZodIssues(parsedParams.error.issues));
        return;
      }

      const actorId = request.auth?.userId ?? "system";
      const auction = await prisma.auction.findUnique({
        where: {
          id: parsedParams.data.auctionId,
        },
        select: {
          id: true,
          state: true,
        },
      });

      if (!auction) {
        await reply.code(404).send({
          error: "AUCTION_NOT_FOUND",
        });
        return;
      }

      const invoice = await prisma.invoice.findUnique({
        where: {
          auctionId: auction.id,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (auction.state === "RELISTED") {
        await reply.code(200).send({
          auctionId: auction.id,
          newStatus: "RELISTED",
        });
        return;
      }

      if (auction.state === "PAID" || invoice?.status === "PAID") {
        await reply.code(409).send({
          error: "AUCTION_ALREADY_PAID",
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.auction.update({
          where: {
            id: auction.id,
          },
          data: {
            state: "RELISTED",
          },
        });

        if (invoice && invoice.status !== "CANCELED") {
          await tx.invoice.update({
            where: {
              id: invoice.id,
            },
            data: {
              status: "CANCELED",
            },
          });
        }

        await tx.auctionStateTransition.create({
          data: {
            auctionId: auction.id,
            fromState: auction.state,
            toState: "RELISTED",
            trigger: "ADMIN_RELISTED",
            actorId,
          },
        });

        await createAuditLog(tx, {
          actorId,
          action: "ADMIN_RELISTED",
          entityType: "Auction",
          entityId: auction.id,
          correlationId: request.id,
          payload: {
            auctionId: auction.id,
            previousAuctionState: auction.state,
            nextAuctionState: "RELISTED",
            invoiceId: invoice?.id ?? null,
            previousInvoiceStatus: invoice?.status ?? null,
            nextInvoiceStatus: invoice ? "CANCELED" : null,
          },
        });
      });

      await reply.code(200).send({
        auctionId: auction.id,
        newStatus: "RELISTED",
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

      void (async () => {
        try {
          const approvedCompany = await prisma.company.findUnique({
            where: { id },
            select: {
              name: true,
              users: {
                select: {
                  user: {
                    select: {
                      email: true,
                      role: true,
                    },
                  },
                },
              },
            },
          });

          if (!approvedCompany) {
            return;
          }

          for (const membership of approvedCompany.users) {
            void sendAccountApprovedEmail(
              {
                email: membership.user.email,
                name: membership.user.email,
                companyName: approvedCompany.name,
                role: membership.user.role as "SELLER" | "BUYER",
              },
              fastify.log,
            );
          }
        } catch {
          // Fire-and-forget email dispatch must never affect the approval flow.
        }
      })();
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

      void (async () => {
        try {
          const rejectedCompany = await prisma.company.findUnique({
            where: { id },
            select: {
              name: true,
              users: {
                select: {
                  user: {
                    select: {
                      email: true,
                    },
                  },
                },
              },
            },
          });

          if (!rejectedCompany) {
            return;
          }

          for (const membership of rejectedCompany.users) {
            void sendAccountRejectedEmail(
              {
                email: membership.user.email,
                name: membership.user.email,
                companyName: rejectedCompany.name,
                rejectionReason:
                  "Your application did not meet our current requirements. Please contact support for details.",
              },
              fastify.log,
            );
          }
        } catch {
          // Fire-and-forget email dispatch must never affect the rejection flow.
        }
      })();
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

      void (async () => {
        try {
          const approvedUser = await prisma.user.findUnique({
            where: { id },
            select: {
              email: true,
              role: true,
              companyUsers: {
                select: {
                  company: {
                    select: {
                      name: true,
                    },
                  },
                },
                take: 1,
              },
            },
          });

          if (!approvedUser) {
            return;
          }

          void sendAccountApprovedEmail(
            {
              email: approvedUser.email,
              name: approvedUser.email,
              companyName: approvedUser.companyUsers[0]?.company?.name ?? "your company",
              role: approvedUser.role as "SELLER" | "BUYER",
            },
            fastify.log,
          );
        } catch {
          // Fire-and-forget email dispatch must never affect the approval flow.
        }
      })();
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

      void (async () => {
        try {
          const rejectedUser = await prisma.user.findUnique({
            where: { id },
            select: {
              email: true,
              companyUsers: {
                select: {
                  company: {
                    select: {
                      name: true,
                    },
                  },
                },
                take: 1,
              },
            },
          });

          if (!rejectedUser) {
            return;
          }

          void sendAccountRejectedEmail(
            {
              email: rejectedUser.email,
              name: rejectedUser.email,
              companyName: rejectedUser.companyUsers[0]?.company?.name ?? "your company",
              rejectionReason:
                "Your application did not meet our current requirements. Please contact support for details.",
            },
            fastify.log,
          );
        } catch {
          // Fire-and-forget email dispatch must never affect the rejection flow.
        }
      })();
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

      void (async () => {
        try {
          const kycUser = await prisma.user.findUnique({
            where: { id },
            select: {
              email: true,
              wallet: {
                select: {
                  balance: true,
                },
              },
            },
          });

          if (!kycUser) {
            return;
          }

          const balanceAed =
            kycUser.wallet?.balance == null ? 0 : await toNumberValue(kycUser.wallet.balance);

          void sendDepositApprovedEmail(
            {
              email: kycUser.email,
              name: kycUser.email,
              amountAed: balanceAed,
            },
            fastify.log,
          );
        } catch {
          // Fire-and-forget email dispatch must never affect the KYC flow.
        }
      })();
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
          companyUsers: {
            select: {
              companyId: true,
            },
          },
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
          companyUsers: {
            select: {
              companyId: true,
            },
          },
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
          companyUsers: {
            select: {
              companyId: true,
            },
          },
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
        const auction = await tx.auction.findUnique({
          where: {
            id: parsedBody.data.auctionId,
          },
          select: {
            id: true,
            state: true,
          },
        });

        if (!auction) {
          return {
            kind: "auction-not-found",
          } as const;
        }

        if (auction.state !== "DEFAULTED") {
          return {
            kind: "auction-not-defaulted",
          } as const;
        }

        const winningBid = await tx.bid.findFirst({
          where: {
            auctionId: parsedBody.data.auctionId,
          },
          orderBy: [{ amount: "desc" }, { sequenceNo: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            userId: true,
            companyId: true,
            amount: true,
          },
        });

        if (!winningBid) {
          return {
            kind: "winning-bid-not-found",
          } as const;
        }

        const buyerCompanyIds = new Set(buyer.companyUsers.map((entry) => entry.companyId));
        const belongsToWinningCompany =
          winningBid.userId === normalizedUserId || buyerCompanyIds.has(winningBid.companyId);

        if (!belongsToWinningCompany) {
          return {
            kind: "winner-company-mismatch",
          } as const;
        }

        await releaseWinnerBidAfterPayment(tx, winningBid.companyId, winningBid.amount);

        const depositWalletRows = await tx.$queryRaw<LockedCompanyDepositWalletRow[]>`
          SELECT
            id,
            available_balance,
            locked_balance
          FROM deposit_wallets
          WHERE company_id = ${winningBid.companyId}
            AND currency = 'AED'
          FOR UPDATE
        `;
        const depositWallet = depositWalletRows[0];

        if (!depositWallet) {
          return {
            kind: "deposit-wallet-not-found",
          } as const;
        }

        const burnableLocks = await tx.$queryRaw<LockedCompanyDepositLockRow[]>`
          SELECT
            id,
            amount,
            status,
            created_at
          FROM deposit_locks
          WHERE company_id = ${winningBid.companyId}
            AND status IN ('ACTIVE', 'RELEASED')
          ORDER BY
            CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
            created_at DESC
          FOR UPDATE
        `;
        const burnableLock = burnableLocks[0];

        if (!burnableLock) {
          return {
            kind: "lock-not-found",
          } as const;
        }

        const lockAmount = burnableLock.amount;
        const walletAmount = lockAmount.toFixed(2);
        const updatedDepositWalletRows = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE deposit_wallets
          SET available_balance = available_balance - ${lockAmount},
              updated_at = NOW()
          WHERE id = ${depositWallet.id}
            AND available_balance >= ${lockAmount}
          RETURNING id
        `;

        if (updatedDepositWalletRows.length === 0) {
          return {
            kind: "insufficient-deposit-wallet-balance",
          } as const;
        }

        await tx.depositLock.update({
          where: {
            id: burnableLock.id,
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
              gte: walletAmount,
            },
          },
          data: {
            balance: {
              decrement: walletAmount,
            },
          },
        });

        if (updatedWallet.count === 0) {
          return {
            kind: "insufficient-wallet-balance",
          } as const;
        }

        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "DEPOSIT_BURN",
            amount: Number(lockAmount.negated().toFixed(2)),
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
            companyId: winningBid.companyId,
            winningBidAmount: winningBid.amount.toFixed(2),
            burnedAmount: walletAmount,
            reason: parsedBody.data.reason,
            depositLockId: burnableLock.id,
          },
        });

        return {
          kind: "burned",
          burnedAmount: Number(walletAmount),
        } as const;
      });

      if (result.kind === "auction-not-found") {
        await reply.code(404).send({
          error: "AUCTION_NOT_FOUND",
        });
        return;
      }

      if (result.kind === "auction-not-defaulted") {
        await reply.code(409).send({
          error: "AUCTION_NOT_DEFAULTED",
        });
        return;
      }

      if (result.kind === "winning-bid-not-found") {
        await reply.code(404).send({
          error: "WINNING_BID_NOT_FOUND",
        });
        return;
      }

      if (result.kind === "winner-company-mismatch") {
        await reply.code(409).send({
          error: "USER_NOT_WINNING_BUYER",
        });
        return;
      }

      if (result.kind === "deposit-wallet-not-found") {
        await reply.code(404).send({
          error: "DEPOSIT_WALLET_NOT_FOUND",
        });
        return;
      }

      if (result.kind === "lock-not-found") {
        await reply.code(400).send({
          error: "NO_ACTIVE_DEPOSIT_LOCK",
        });
        return;
      }

      if (
        result.kind === "insufficient-deposit-wallet-balance" ||
        result.kind === "insufficient-wallet-balance"
      ) {
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
