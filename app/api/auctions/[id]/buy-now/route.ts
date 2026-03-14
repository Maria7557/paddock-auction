export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { verifyJwt } from "@/src/lib/auth";
import prisma from "@/src/infrastructure/database/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const terminalStates = new Set([
  "CLOSED",
  "CANCELED",
  "PAID",
  "DEFAULTED",
  "ENDED",
]);

function parseToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  const cookieToken = request.cookies.get("token")?.value?.trim();
  return cookieToken && cookieToken.length > 0 ? cookieToken : null;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const token = parseToken(request);

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const auth = await verifyJwt(token);

  if (!auth) {
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }

  if (auth.role !== "BUYER") {
    return NextResponse.json({ message: "Buy Now is available for buyers only" }, { status: 403 });
  }

  if (!auth.companyId) {
    return NextResponse.json({ message: "Buyer company is required" }, { status: 400 });
  }

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      vehicle: {
        select: {
          marketPrice: true,
        },
      },
    },
  });

  if (!auction) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const buyNowPrice = auction.vehicle?.marketPrice ? Number(auction.vehicle.marketPrice.toString()) : 0;

  if (buyNowPrice <= 0) {
    return NextResponse.json({ message: "Buy Now not available" }, { status: 400 });
  }

  if (terminalStates.has(auction.state)) {
    return NextResponse.json({ message: "Auction closed" }, { status: 400 });
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.auction.update({
      where: { id },
      data: {
        state: "CLOSED",
        winnerCompanyId: auth.companyId,
        closedAt: now,
        updatedAt: now,
      },
    });

    await tx.auctionStateTransition.create({
      data: {
        auctionId: id,
        fromState: auction.state,
        toState: "CLOSED",
        trigger: "BUY_NOW",
        reason: "Buy now purchase confirmed",
        actorId: auth.userId,
      },
    });
  });

  return NextResponse.json({ ok: true, message: "Purchase confirmed" });
}
