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

  if (!id?.trim()) {
    return NextResponse.json({ error: "INVALID_COMPANY_ID" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id },
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
      return null;
    }

    await tx.company.update({
      where: { id },
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
      actorId: session.actorId,
      action: "COMPANY_REJECTED",
      entityType: "Company",
      entityId: id,
      payload: {
        companyId: id,
        status: "REJECTED",
      },
    });

    return true;
  });

  if (!updated) {
    return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
