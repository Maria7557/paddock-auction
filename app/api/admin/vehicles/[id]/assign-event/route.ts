export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { createAuditLog } from "@/app/api/admin/_lib/admin_route_utils";
import { requireAdminSession } from "@/app/api/admin/_lib/admin_session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const schema = z.object({
  eventId: z.string().trim().min(1).nullable().optional(),
});

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireAdminSession(request);

  if (session instanceof NextResponse) {
    return session;
  }

  const { id } = await context.params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const latestAuction = await prisma.auction.findFirst({
    where: {
      vehicleId: id,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      state: true,
    },
  });

  if (!latestAuction) {
    return NextResponse.json({ error: "VEHICLE_AUCTION_NOT_FOUND" }, { status: 404 });
  }

  if (!parsed.data.eventId) {
    await prisma.$transaction(async (tx) => {
      await tx.auction.update({
        where: {
          id: latestAuction.id,
        },
        data: {
          state: "DRAFT",
        },
      });

      await createAuditLog(tx, {
        actorId: session.actorId,
        action: "VEHICLE_EVENT_UNASSIGNED",
        entityType: "Vehicle",
        entityId: id,
        payload: {
          vehicleId: id,
          auctionId: latestAuction.id,
        },
      });
    });

    return NextResponse.json({ success: true });
  }

  const eventAuction = await prisma.auction.findUnique({
    where: {
      id: parsed.data.eventId,
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
    },
  });

  if (!eventAuction) {
    return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.auction.update({
      where: {
        id: latestAuction.id,
      },
      data: {
        startsAt: eventAuction.startsAt,
        endsAt: eventAuction.endsAt,
        state: "SCHEDULED",
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "VEHICLE_EVENT_ASSIGNED",
      entityType: "Vehicle",
      entityId: id,
      payload: {
        vehicleId: id,
        auctionId: latestAuction.id,
        eventId: eventAuction.id,
      },
    });
  });

  return NextResponse.json({ success: true });
}
