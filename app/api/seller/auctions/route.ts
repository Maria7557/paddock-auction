export const runtime = "nodejs";

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

function decimalToNumber(value: Prisma.Decimal | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

function matchesState(state: string, filter: string): boolean {
  const normalized = filter.toUpperCase();

  if (!normalized || normalized === "ALL") {
    return true;
  }

  if (normalized === "ENDED") {
    return ["ENDED", "CLOSED", "PAID", "PAYMENT_PENDING", "DEFAULTED", "CANCELED"].includes(state);
  }

  return state === normalized;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const status = searchParams.get("status")?.trim().toUpperCase() ?? "ALL";
  const sort = searchParams.get("sort")?.trim() ?? "newest";

  const orderBy: Prisma.AuctionOrderByWithRelationInput[] =
    sort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : sort === "price_asc"
        ? [{ currentPrice: "asc" }, { id: "asc" }]
        : sort === "price_desc"
          ? [{ currentPrice: "desc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "asc" }];

  const auctions = await prisma.auction.findMany({
    where: {
      sellerCompanyId: auth.companyId,
    },
    orderBy,
    include: {
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          vin: true,
        },
      },
      _count: {
        select: {
          bids: true,
        },
      },
    },
  });

  const filtered = auctions.filter((auction) => {
    if (!matchesState(auction.state, status)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const vehicleLabel = auction.vehicle
      ? `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.vin}`.toLowerCase()
      : "";

    return vehicleLabel.includes(query);
  });

  return NextResponse.json({
    total: filtered.length,
    auctions: filtered.map((auction) => ({
      id: auction.id,
      state: auction.state,
      vehicleId: auction.vehicleId,
      vehicleLabel: auction.vehicle ? `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}` : auction.vehicleId,
      startingPriceAed: decimalToNumber(auction.startingPrice),
      currentBidAed: decimalToNumber(auction.currentPrice),
      bidsCount: auction._count.bids,
      startsAt: auction.startsAt.toISOString(),
      endsAt: auction.endsAt.toISOString(),
    })),
  });
}
