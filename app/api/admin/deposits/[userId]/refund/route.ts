export const runtime = "nodejs";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

import { createAuditLog, json, requireAdmin } from "../../../_lib/admin_route_utils";

const refundDepositSchema = z.object({
  reason: z.string().trim().min(10),
  amount: z.number().int().positive(),
  auctionId: z.string().uuid().optional(),
});

type RouteContext = {
  params: Promise<{ userId: string }>;
};

function decimalToNumber(value: Prisma.Decimal): number {
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

    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      return json(400, {
        error: "INVALID_REQUEST",
        message: "Request body must be valid JSON",
      });
    }

    const parsed = refundDepositSchema.safeParse(requestBody);

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

    const correlationId = request.headers.get("x-correlation-id")?.trim();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    const amountValue = parsed.data.amount;

    const result = await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: {
          id: wallet.id,
        },
        data: {
          balance: {
            increment: amountValue,
          },
        },
        select: {
          balance: true,
        },
      });

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
          'ADMIN_REFUND'::"LedgerType",
          ${amountValue},
          ${parsed.data.auctionId ?? adminContext.actorId},
          CURRENT_TIMESTAMP
        )
      `);

      await createAuditLog(tx, {
        actorId: adminContext.actorId,
        action: "DEPOSIT_REFUNDED_BY_ADMIN",
        entityType: "User",
        entityId: normalizedUserId,
        correlationId,
        idempotencyKey,
        payload: {
          userId: normalizedUserId,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
          auctionId: parsed.data.auctionId ?? null,
        },
      });

      return {
        newBalance: decimalToNumber(updatedWallet.balance),
      };
    });

    return json(200, {
      userId: normalizedUserId,
      refundedAmount: parsed.data.amount,
      newBalance: result.newBalance,
      reason: parsed.data.reason,
    });
  },
);
