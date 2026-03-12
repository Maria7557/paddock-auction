export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { AuctionState } from "@prisma/client";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { createAuditLog } from "@/app/api/admin/_lib/admin_route_utils";
import { requireAdminSession } from "@/app/api/admin/_lib/admin_session";

const schema = z.object({
  title: z.string().trim().min(1),
  date: z.string().trim().min(1),
  startTime: z.string().trim().min(1).optional(),
  time: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
});

type EventMeta = {
  title?: string;
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

function isAuctionState(value: string): value is AuctionState {
  return [
    "DRAFT",
    "SCHEDULED",
    "LIVE",
    "EXTENDED",
    "CLOSED",
    "CANCELED",
  ].includes(value);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdminSession(request);

  if (session instanceof NextResponse) {
    return session;
  }

  const rawStatus = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() ?? "";

  const where =
    rawStatus && isAuctionState(rawStatus)
      ? {
          state: rawStatus,
        }
      : undefined;

  const auctions = await prisma.auction.findMany({
    where,
    include: {
      transitions: {
        where: {
          trigger: "EVENT_META",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });

  const grouped = new Map<
    string,
    {
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      status: string;
      lotsCount: number;
    }
  >();

  for (const auction of auctions) {
    const key = `${auction.startsAt.toISOString()}::${auction.endsAt.toISOString()}`;
    const existing = grouped.get(key);

    if (existing) {
      grouped.set(key, {
        ...existing,
        lotsCount: existing.lotsCount + 1,
      });
      continue;
    }

    const meta = parseMeta(auction.transitions[0]?.reason ?? null);

    grouped.set(key, {
      id: auction.id,
      title:
        meta.title?.trim() || `Auction Event ${new Date(auction.startsAt).toLocaleDateString("en-GB")}`,
      startsAt: auction.startsAt.toISOString(),
      endsAt: auction.endsAt.toISOString(),
      status: auction.state,
      lotsCount: 1,
    });
  }

  return NextResponse.json({
    events: [...grouped.values()],
  });
}

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

  const startTime = parsed.data.startTime ?? parsed.data.time;

  if (!startTime) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const startsAt = new Date(`${parsed.data.date}T${startTime}:00+04:00`);

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
        time: startTime,
      },
    });

    return eventAuction;
  });

  return NextResponse.json({ id: created.id, success: true }, { status: 201 });
}
