export const runtime = "nodejs";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

import { createAuditLog, json, requireAdmin } from "../../../_lib/admin_route_utils";

const approveReturnSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

type RouteContext = {
  params: Promise<{ userId: string }>;
};

type PendingRequestRow = {
  id: string;
  amount: Prisma.Decimal | number | string;
  reference: string | null;
};

function amountToNumber(value: Prisma.Decimal | number | string): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number(value.toString());
}

export const POST = withStructuredMutationLogging(
  async (request: Request, context: RouteContext): Promise<Response> => {
    const adminContext = requireAdmin(request);

    if (adminContext instanceof Response) {
      return adminContext;
    }

    const { userId } = await context.params;
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      return json(400, {
        error: "INVALID_USER_ID",
      });
    }

    let requestBody: unknown = {};

    if (request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      try {
        requestBody = await request.json();
      } catch {
        return json(400, {
          error: "INVALID_REQUEST",
          message: "Request body must be valid JSON",
        });
      }
    }

    const parsed = approveReturnSchema.safeParse(requestBody);

    if (!parsed.success) {
      return json(400, {
        error: "INVALID_REQUEST",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

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
      return json(404, {
        error: "USER_NOT_FOUND",
      });
    }

    if (buyer.role !== "BUYER") {
      return json(400, {
        error: "NOT_A_BUYER",
      });
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
      return json(404, {
        error: "WALLET_NOT_FOUND",
      });
    }

    const pendingRows = await prisma.$queryRaw<PendingRequestRow[]>(Prisma.sql`
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
    `);

    const pendingRequest = pendingRows[0];

    if (!pendingRequest) {
      return json(404, {
        error: "NO_PENDING_RETURN_REQUEST",
      });
    }

    const correlationId = request.headers.get("x-correlation-id")?.trim();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    await prisma.$transaction(async (tx) => {
      const requestedAmount = amountToNumber(pendingRequest.amount);
      const approvalAmount = Math.abs(requestedAmount);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WalletLedger" (
          id,
          "walletId",
          type,
          amount,
          reference,
          "createdAt"
        ) VALUES (
          ${randomUUID()},
          ${wallet.id},
          'WITHDRAWAL_APPROVED'::"LedgerType",
          ${approvalAmount},
          ${pendingRequest.reference ?? pendingRequest.id},
          CURRENT_TIMESTAMP
        )
      `);

      await createAuditLog(tx, {
        actorId: adminContext.actorId,
        action: "DEPOSIT_RETURN_APPROVED",
        entityType: "User",
        entityId: normalizedUserId,
        correlationId,
        idempotencyKey,
        payload: {
          userId: normalizedUserId,
          reason: parsed.data.reason ?? null,
          requestLedgerId: pendingRequest.id,
          approvedAmount: approvalAmount,
        },
      });
    });

    return json(200, {
      userId: normalizedUserId,
      status: "APPROVED",
      message: "Refund will be processed within 7 days",
    });
  },
);
