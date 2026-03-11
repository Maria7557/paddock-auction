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
  priceAed: z.coerce.number().positive(),
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

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: {
      id: true,
    },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "VEHICLE_NOT_FOUND" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id },
      data: {
        marketPrice: parsed.data.priceAed,
      },
    });

    await createAuditLog(tx, {
      actorId: session.actorId,
      action: "VEHICLE_MARKET_PRICE_SET",
      entityType: "Vehicle",
      entityId: id,
      payload: {
        vehicleId: id,
        priceAed: parsed.data.priceAed,
      },
    });
  });

  return NextResponse.json({ success: true });
}
