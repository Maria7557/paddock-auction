export const runtime = "nodejs";

import { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";

import { json, requireAdmin } from "../../_lib/admin_route_utils";

type PendingReturnRow = {
  ledgerId: string;
  walletId: string;
  userId: string;
  email: string;
  amount: Prisma.Decimal | number | string;
  reference: string | null;
  createdAt: Date;
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

export async function GET(request: Request): Promise<Response> {
  const adminContext = requireAdmin(request);

  if (adminContext instanceof Response) {
    return adminContext;
  }

  const pendingReturns = await prisma.$queryRaw<PendingReturnRow[]>(Prisma.sql`
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
  `);

  return json(200, {
    returns: pendingReturns.map((row) => ({
      ledgerId: row.ledgerId,
      walletId: row.walletId,
      userId: row.userId,
      email: row.email,
      amount: amountToNumber(row.amount),
      reference: row.reference,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
