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
      state: true,
      sellerCompanyId: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  }

  const alreadyInEvent = await prisma.auction.findFirst({
    where: {
      vehicleId: parsed.data.vehicleId,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    select: {
      id: true,
    },
  });

  if (alreadyInEvent) {
    return NextResponse.json({ success: true, auctionId: alreadyInEvent.id });
  }

  const sourceAuction = await prisma.auction.findFirst({
    where: {
      vehicleId: parsed.data.vehicleId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      sellerCompanyId: true,
      minIncrement: true,
      currentPrice: true,
      startingPrice: true,
      buyNowPrice: true,
    },
  });

  if (!sourceAuction) {
    return NextResponse.json({ error: "SOURCE_AUCTION_NOT_FOUND" }, { status: 404 });
  }

  const createdLot = await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.create({
      data: {
        vehicleId: parsed.data.vehicleId,
        sellerCompanyId: sourceAuction.sellerCompanyId || event.sellerCompanyId,
        state: event.state === "LIVE" || event.state === "EXTENDED" ? "SCHEDULED" : event.state,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        minIncrement: sourceAuction.minIncrement,
        currentPrice: sourceAuction.currentPrice,
        startingPrice: sourceAuction.startingPrice,
        buyNowPrice: sourceAuction.buyNowPrice,
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "EVENT_VEHICLE_ADDED",
      entityType: "Event",
      entityId: id,
      payload: {
        eventId: id,
        vehicleId: parsed.data.vehicleId,
        auctionId: auction.id,
      },
    });

    return auction;
  });

  return NextResponse.json({ success: true, auctionId: createdLot.id });
}
