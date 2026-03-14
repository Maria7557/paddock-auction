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
  vehicleIds: z.array(z.string().trim().min(1)).min(1),
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
    return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  }

  const lots = await prisma.auction.findMany({
    where: {
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    select: {
      vehicleId: true,
    },
  });

  const lotVehicleIds = new Set(lots.map((lot) => lot.vehicleId));

  for (const vehicleId of parsed.data.vehicleIds) {
    if (!lotVehicleIds.has(vehicleId)) {
      return NextResponse.json({ error: "INVALID_REORDER_SET" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.auctionStateTransition.create({
      data: {
        auctionId: id,
        fromState: event.state,
        toState: event.state,
        trigger: "EVENT_ORDER",
        reason: JSON.stringify({
          vehicleIds: parsed.data.vehicleIds,
        }),
        actorId: session.actorId,
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "EVENT_LOTS_REORDERED",
      entityType: "Event",
      entityId: id,
      payload: {
        eventId: id,
        vehicleIds: parsed.data.vehicleIds,
      },
    });
  });

  return NextResponse.json({ success: true });
}
