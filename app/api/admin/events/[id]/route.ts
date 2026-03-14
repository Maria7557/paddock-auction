export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";

import { createAuditLog } from "@/app/api/admin/_lib/admin_route_utils";
import { requireAdminSession } from "@/app/api/admin/_lib/admin_session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type EventMeta = {
  title?: string;
  description?: string;
};

type EventOrder = {
  vehicleIds?: string[];
};

function parseMeta(reason: string | null): EventMeta {
  if (!reason) {
    return {};
  }

  try {
    return JSON.parse(reason) as EventMeta;
  } catch {
    return {};
  }
}

function parseOrder(reason: string | null): string[] {
  if (!reason) {
    return [];
  }

  try {
    const parsed = JSON.parse(reason) as EventOrder;
    return Array.isArray(parsed.vehicleIds) ? parsed.vehicleIds : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireAdminSession(request);

  if (session instanceof NextResponse) {
    return session;
  }

  const { id } = await context.params;

  const event = await prisma.auction.findUnique({
    where: { id },
    include: {
      transitions: {
        where: {
          trigger: {
            in: ["EVENT_META", "EVENT_ORDER"],
          },
        },
        orderBy: { createdAt: "desc" },
      },
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
    include: {
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          vin: true,
          marketPrice: true,
          images: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const metaTransition = event.transitions.find((item) => item.trigger === "EVENT_META") ?? null;
  const orderTransition = event.transitions.find((item) => item.trigger === "EVENT_ORDER") ?? null;

  const meta = parseMeta(metaTransition?.reason ?? null);
  const vehicleOrder = parseOrder(orderTransition?.reason ?? null);

  const orderIndexByVehicleId = new Map(vehicleOrder.map((vehicleId, index) => [vehicleId, index]));

  const orderedLots = [...lots].sort((a, b) => {
    const aOrder = orderIndexByVehicleId.get(a.vehicleId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderIndexByVehicleId.get(b.vehicleId) ?? Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return NextResponse.json({
    id: event.id,
    title: meta.title ?? `Auction Event ${event.startsAt.toISOString()}`,
    description: meta.description ?? "",
    status: event.state,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    lots: orderedLots.map((lot) => ({
      auctionId: lot.id,
      vehicleId: lot.vehicleId,
      title: `${lot.vehicle.brand} ${lot.vehicle.model} ${lot.vehicle.year}`,
      vin: lot.vehicle.vin,
      marketPriceAed: lot.vehicle.marketPrice ? Number(lot.vehicle.marketPrice.toString()) : 0,
      imageUrl: lot.vehicle.images[0] ?? null,
    })),
  });
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireAdminSession(request);

  if (session instanceof NextResponse) {
    return session;
  }

  const { id } = await context.params;

  const event = await prisma.auction.findUnique({
    where: { id },
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

  if (event.state !== "DRAFT") {
    return NextResponse.json({ error: "EVENT_DELETE_ALLOWED_ONLY_FOR_DRAFT" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.auction.deleteMany({
      where: {
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        state: "DRAFT",
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "EVENT_DELETED",
      entityType: "Event",
      entityId: id,
      payload: {
        eventId: id,
      },
    });
  });

  return NextResponse.json({ success: true });
}
