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

function resolveStartingPriceAed(startingPrice: Prisma.Decimal | null, currentPrice: Prisma.Decimal): number {
  const starting = decimalToNumber(startingPrice);

  if (starting > 0) {
    return starting;
  }

  return decimalToNumber(currentPrice);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const company = await prisma.company.findUnique({
    where: { id: auth.companyId },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!company) {
    return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });
  }

  const [vehicleLinks, draftAuctions, liveAuctions, soldAuctions, recentAuctions] = await Promise.all([
    prisma.auction.findMany({
      where: { sellerCompanyId: auth.companyId },
      distinct: ["vehicleId"],
      select: { vehicleId: true },
    }),
    prisma.auction.count({
      where: {
        sellerCompanyId: auth.companyId,
        state: "DRAFT",
      },
    }),
    prisma.auction.count({
      where: {
        sellerCompanyId: auth.companyId,
        state: "LIVE",
      },
    }),
    prisma.auction.count({
      where: {
        sellerCompanyId: auth.companyId,
        state: "ENDED",
        highestBidId: {
          not: null,
        },
      },
    }),
    prisma.auction.findMany({
      where: {
        sellerCompanyId: auth.companyId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 10,
      select: {
        id: true,
        state: true,
        startsAt: true,
        endsAt: true,
        startingPrice: true,
        currentPrice: true,
        vehicle: {
          select: {
            brand: true,
            model: true,
            year: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    company,
    metrics: {
      totalVehicles: vehicleLinks.length,
      draftAuctions,
      liveAuctions,
      sold: soldAuctions,
    },
    recentAuctions: recentAuctions.map((auction) => ({
      id: auction.id,
      vehicle: auction.vehicle ? `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}` : "-",
      state: auction.state,
      startingPriceAed: resolveStartingPriceAed(auction.startingPrice, auction.currentPrice),
      startsAt: auction.startsAt.toISOString(),
      endsAt: auction.endsAt.toISOString(),
    })),
  });
}
