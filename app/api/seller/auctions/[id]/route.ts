export const runtime = "nodejs";

import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchAuctionSchema = z.object({
  action: z.enum(["publish", "cancel", "update"]).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  startingPriceAed: z.coerce.number().positive().optional(),
  reservePriceAed: z.coerce.number().positive().optional(),
});

function decimalToNumber(value: Prisma.Decimal | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const auction = await prisma.auction.findFirst({
    where: {
      id,
      sellerCompanyId: auth.companyId,
    },
    include: {
      vehicle: true,
      _count: {
        select: {
          bids: true,
        },
      },
    },
  });

  if (!auction) {
    return NextResponse.json({ error: "AUCTION_NOT_FOUND" }, { status: 404 });
  }

  const bids = await prisma.bid.findMany({
    where: {
      auctionId: id,
    },
    orderBy: [{ amount: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: {
      id: true,
      amount: true,
      createdAt: true,
      companyId: true,
    },
  });

  const companyIds = [...new Set(bids.map((bid) => bid.companyId))];
  const companies = companyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const companyById = new Map(companies.map((company) => [company.id, company.name]));

  return NextResponse.json({
    auction: {
      id: auction.id,
      state: auction.state,
      startsAt: auction.startsAt.toISOString(),
      endsAt: auction.endsAt.toISOString(),
      startingPriceAed: decimalToNumber(auction.startingPrice),
      reservePriceAed: decimalToNumber(auction.buyNowPrice),
      currentBidAed: decimalToNumber(auction.currentPrice),
      totalBids: auction._count.bids,
      vehicle: auction.vehicle
        ? {
            id: auction.vehicle.id,
            brand: auction.vehicle.brand,
            model: auction.vehicle.model,
            year: auction.vehicle.year,
            vin: auction.vehicle.vin,
          }
        : null,
    },
    bids: bids.map((bid, index) => ({
      id: bid.id,
      rank: index + 1,
      companyName: companyById.get(bid.companyId) ?? bid.companyId,
      amountAed: decimalToNumber(bid.amount),
      createdAt: bid.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const auction = await prisma.auction.findFirst({
    where: {
      id,
      sellerCompanyId: auth.companyId,
    },
    select: {
      id: true,
      state: true,
      startsAt: true,
      endsAt: true,
    },
  });

  if (!auction) {
    return NextResponse.json({ error: "AUCTION_NOT_FOUND" }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = patchAuctionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const action = payload.action ?? "update";

  if (action === "publish") {
    if (auction.state !== "DRAFT") {
      return NextResponse.json(
        {
          error: "INVALID_STATE",
          message: "Only DRAFT auctions can be published",
        },
        { status: 409 },
      );
    }

    await prisma.auction.update({
      where: {
        id: auction.id,
      },
      data: {
        state: "SCHEDULED",
      },
    });

    return NextResponse.json({ message: "Auction published" });
  }

  if (action === "cancel") {
    if (!["DRAFT", "SCHEDULED", "LIVE", "EXTENDED"].includes(auction.state)) {
      return NextResponse.json(
        {
          error: "INVALID_STATE",
          message: "Auction cannot be canceled in current state",
        },
        { status: 409 },
      );
    }

    await prisma.auction.update({
      where: {
        id: auction.id,
      },
      data: {
        state: "CANCELED",
      },
    });

    return NextResponse.json({ message: "Auction canceled" });
  }

  if (auction.state !== "DRAFT") {
    return NextResponse.json(
      {
        error: "INVALID_STATE",
        message: "Only DRAFT auctions can be edited",
      },
      { status: 409 },
    );
  }

  const startsAt = payload.startsAt ? new Date(payload.startsAt) : auction.startsAt;
  const endsAt = payload.endsAt ? new Date(payload.endsAt) : auction.endsAt;

  if (endsAt <= startsAt) {
    return NextResponse.json(
      {
        error: "INVALID_AUCTION_WINDOW",
        message: "endsAt must be after startsAt",
      },
      { status: 400 },
    );
  }

  await prisma.auction.update({
    where: {
      id: auction.id,
    },
    data: {
      startsAt,
      endsAt,
      startingPrice: payload.startingPriceAed,
      currentPrice: payload.startingPriceAed,
      buyNowPrice: payload.reservePriceAed,
    },
  });

  return NextResponse.json({ message: "Auction updated" });
}
