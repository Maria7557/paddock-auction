export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function createPayloadHash(payload: Prisma.InputJsonValue): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export const POST = withStructuredMutationLogging(async (request: Request): Promise<Response> => {
  const userRole = request.headers.get("x-user-role")?.trim();
  const kycVerified = request.headers.get("x-kyc-verified")?.trim();
  const userId = request.headers.get("x-user-id")?.trim();

  if (userRole !== "BUYER") {
    return json(403, {
      error: "BUYERS_ONLY",
    });
  }

  if (kycVerified !== "true") {
    return json(403, {
      error: "KYC_PENDING",
    });
  }

  if (!userId) {
    return json(401, {
      error: "UNAUTHORIZED",
    });
  }

  const wallet = await prisma.wallet.upsert({
    where: {
      userId,
    },
    update: {},
    create: {
      userId,
      balance: new Prisma.Decimal(0),
      lockedBalance: new Prisma.Decimal(0),
    },
    select: {
      id: true,
      balance: true,
    },
  });

  const [activeDepositLock, liveBid] = await Promise.all([
    prisma.depositLock.findFirst({
      where: {
        walletId: wallet.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    }),
    prisma.bid.findFirst({
      where: {
        userId,
        auction: {
          state: {
            in: ["LIVE", "EXTENDED"],
          },
        },
      },
      select: {
        id: true,
        auctionId: true,
      },
    }),
  ]);

  const reasons: string[] = [];
  const balanceAmount = decimalToNumber(wallet.balance);

  if (activeDepositLock) {
    reasons.push("ACTIVE_DEPOSIT_LOCK_EXISTS");
  }

  if (liveBid) {
    reasons.push("LIVE_AUCTION_PARTICIPATION_EXISTS");
  }

  if (balanceAmount <= 0) {
    reasons.push("NO_AVAILABLE_BALANCE");
  }

  if (reasons.length > 0) {
    return json(400, {
      error: "WITHDRAWAL_NOT_ELIGIBLE",
      reasons,
    });
  }

  const requestReference = `withdrawal-request:${randomUUID()}`;
  const correlationId = request.headers.get("x-correlation-id")?.trim();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  await prisma.$transaction(async (tx) => {
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
        'WITHDRAWAL_REQUESTED'::"LedgerType",
        ${balanceAmount * -1},
        ${requestReference},
        CURRENT_TIMESTAMP
      )
    `);

    const auditPayload: Prisma.InputJsonValue = {
      userId,
      walletId: wallet.id,
      amount: balanceAmount,
      requestReference,
    };

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "DEPOSIT_RETURN_REQUESTED",
        entityType: "User",
        entityId: userId,
        correlationId,
        idempotencyKey,
        payloadHash: createPayloadHash(auditPayload),
        payload: auditPayload,
      },
    });
  });

  return json(200, {
    status: "PENDING_REVIEW",
    message: "Your refund request is under review.",
    estimatedDays: 7,
    amount: balanceAmount,
  });
});
