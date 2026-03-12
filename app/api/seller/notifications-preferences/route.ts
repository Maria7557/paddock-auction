export const runtime = "nodejs";

import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

const preferencesSchema = z.object({
  email: z.object({
    auctionStarts: z.boolean(),
    auctionEnds: z.boolean(),
    newBidOnMyLot: z.boolean(),
    auctionWon: z.boolean(),
    paymentReminder: z.boolean(),
  }),
  sms: z.object({
    auctionStarts: z.boolean(),
    auctionEnds: z.boolean(),
    newBidOnMyLot: z.boolean(),
    auctionWon: z.boolean(),
    paymentReminder: z.boolean(),
  }),
});

const DEFAULT_PREFERENCES = {
  email: {
    auctionStarts: true,
    auctionEnds: true,
    newBidOnMyLot: true,
    auctionWon: true,
    paymentReminder: true,
  },
  sms: {
    auctionStarts: false,
    auctionEnds: false,
    newBidOnMyLot: false,
    auctionWon: false,
    paymentReminder: false,
  },
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const latest = await prisma.auditLog.findFirst({
    where: {
      entityType: "SELLER_NOTIFICATION_PREFS",
      entityId: auth.companyId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      payload: true,
    },
  });

  const payload = latest?.payload ?? DEFAULT_PREFERENCES;

  return NextResponse.json({ preferences: payload });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = preferencesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  await prisma.auditLog.create({
    data: {
      actorId: auth.userId,
      action: "SELLER_NOTIFICATION_PREFS_UPDATED",
      entityType: "SELLER_NOTIFICATION_PREFS",
      entityId: auth.companyId,
      payload,
      payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    },
  });

  return NextResponse.json({ message: "Notification preferences saved" });
}
