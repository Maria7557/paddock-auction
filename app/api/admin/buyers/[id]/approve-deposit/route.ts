export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";

import { createAuditLog } from "@/app/api/admin/_lib/admin_route_utils";
import { requireAdminSession } from "@/app/api/admin/_lib/admin_session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireAdminSession(request);

  if (session instanceof NextResponse) {
    return session;
  }

  const { id } = await context.params;

  const buyer = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      role: true,
      kycVerified: true,
      status: true,
    },
  });

  if (!buyer || buyer.role !== "BUYER") {
    return NextResponse.json({ error: "BUYER_NOT_FOUND" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id,
      },
      data: {
        kycVerified: true,
        status: "ACTIVE",
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "DEPOSIT_APPROVED",
      entityType: "User",
      entityId: id,
      payload: {
        userId: id,
        previousStatus: buyer.status,
        previousKycVerified: buyer.kycVerified,
        nextStatus: "ACTIVE",
        nextKycVerified: true,
      },
    });
  });

  return NextResponse.json({ success: true });
}
