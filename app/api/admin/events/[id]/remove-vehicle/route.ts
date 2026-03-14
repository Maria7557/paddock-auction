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
  vehicleId: z.string().trim().min(1),
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
      id: true,
      vehicleId: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const lotToDelete = lots.find((lot) => lot.vehicleId === parsed.data.vehicleId) ?? null;

  if (!lotToDelete) {
    return NextResponse.json({ error: "VEHICLE_NOT_IN_EVENT" }, { status: 404 });
  }

  if (lots.length === 1) {
    return NextResponse.json({ error: "EVENT_MUST_HAVE_AT_LEAST_ONE_LOT" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.auction.delete({
      where: {
        id: lotToDelete.id,
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "EVENT_VEHICLE_REMOVED",
      entityType: "Event",
      entityId: id,
      payload: {
        eventId: id,
        vehicleId: parsed.data.vehicleId,
      },
    });
  });

  return NextResponse.json({ success: true });
}
