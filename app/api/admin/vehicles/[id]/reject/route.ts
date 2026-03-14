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

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
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
    return NextResponse.json({ error: "VEHICLE_NOT_FOUND" }, { status: 404 });
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

    await createAuditLog(tx, {
      actorId: session.actorId,
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

  return NextResponse.json({ success: true });
}
