export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { createAuditLog } from "@/app/api/admin/_lib/admin_route_utils";
import { requireAdminSession } from "@/app/api/admin/_lib/admin_session";

const schema = z.object({
  title: z.string().trim().min(1),
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdminSession(request);

  if (session instanceof NextResponse) {
    return session;
  }

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

  const startsAt = new Date(`${parsed.data.date}T${parsed.data.time}:00+04:00`);

  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "INVALID_EVENT_DATE" }, { status: 400 });
  }

  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

  const seedAuction = await prisma.auction.findFirst({
    select: {
      vehicleId: true,
      sellerCompanyId: true,
      minIncrement: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  if (!seedAuction) {
    return NextResponse.json(
      {
        error: "NO_BASE_VEHICLE",
      },
      { status: 400 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const eventAuction = await tx.auction.create({
      data: {
        vehicleId: seedAuction.vehicleId,
        sellerCompanyId: seedAuction.sellerCompanyId,
        state: "DRAFT",
        startsAt,
        endsAt,
        startingPrice: 0,
        currentPrice: 0,
        minIncrement: seedAuction.minIncrement,
      },
    });

    await tx.auctionStateTransition.create({
      data: {
        auctionId: eventAuction.id,
        fromState: "DRAFT",
        toState: "DRAFT",
        trigger: "EVENT_META",
        reason: JSON.stringify({
          title: parsed.data.title,
          description: parsed.data.description ?? "",
        }),
        actorId: session.actorId,
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "EVENT_CREATED",
      entityType: "Event",
      entityId: eventAuction.id,
      payload: {
        eventId: eventAuction.id,
        title: parsed.data.title,
        date: parsed.data.date,
        time: parsed.data.time,
      },
    });

    return eventAuction;
  });

  return NextResponse.json({ id: created.id, success: true }, { status: 201 });
}
