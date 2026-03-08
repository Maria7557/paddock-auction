export const runtime = "nodejs";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

import { createAuditLog, json, requireAdmin } from "../../../_lib/admin_route_utils";

const burnDepositSchema = z.object({
  reason: z.string().trim().min(10),
  auctionId: z.string().trim().min(1),
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

    const parsed = burnDepositSchema.safeParse(requestBody);

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

    const activeLock = await prisma.depositLock.findFirst({
      where: {
        auctionId: parsed.data.auctionId,
        walletId: wallet.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        amount: true,
      },
    });

    if (!activeLock) {
      return json(400, {
        error: "NO_ACTIVE_DEPOSIT_LOCK",
      });
    }

    const correlationId = request.headers.get("x-correlation-id")?.trim();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    const lockAmount = decimalToNumber(activeLock.amount);

    const result = await prisma.$transaction(async (tx) => {

      await tx.depositLock.update({
        where: {
          id: activeLock.id,
        },
        data: {
          status: "BURNED",
          burnedAt: new Date(),
          resolutionReason: parsed.data.reason,
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
          'DEPOSIT_BURN'::"LedgerType",
          ${lockAmount * -1},
          ${parsed.data.auctionId},
          CURRENT_TIMESTAMP
        )
      `);

      await createAuditLog(tx, {
        actorId: adminContext.actorId,
        action: "DEPOSIT_BURNED",
        entityType: "User",
        entityId: normalizedUserId,
        correlationId,
        idempotencyKey,
        payload: {
          userId: normalizedUserId,
          auctionId: parsed.data.auctionId,
          burnedAmount: lockAmount,
          reason: parsed.data.reason,
          depositLockId: activeLock.id,
        },
      });

      return {
        insufficientWalletBalance: false,
        burnedAmount: lockAmount,
      } as const;
    });

    if (result.insufficientWalletBalance) {
      return json(409, {
        error: "INSUFFICIENT_WALLET_BALANCE_FOR_BURN",
      });
    }

    return json(200, {
      userId: normalizedUserId,
      auctionId: parsed.data.auctionId,
      burnedAmount: result.burnedAmount,
      reason: parsed.data.reason,
    });
  },
);
