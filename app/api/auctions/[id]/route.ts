export const runtime = "nodejs";

import { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  if (!value) {
    return null;
  }

  return Number(value.toString());
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;

  const auction = await prisma.auction.findUnique({
    where: {
      id,
    },
    include: {
      vehicle: true,
    },
  });

  if (!auction) {
    return json(404, {
      error: "AUCTION_NOT_FOUND",
    });
  }

  const [company, bids, similarAuctions, highestBid, totalBids] = await Promise.all([
    prisma.company.findUnique({
      where: {
        id: auction.sellerCompanyId,
      },
      select: {
        name: true,
        registrationNumber: true,
      },
    }),
    prisma.bid.findMany({
      where: {
        auctionId: id,
      },
      orderBy: {
        sequenceNo: "desc",
      },
      take: 20,
      select: {
        id: true,
        amount: true,
        sequenceNo: true,
        createdAt: true,
        userId: true,
      },
    }),
    prisma.auction.findMany({
      where: {
        id: {
          not: id,
        },
        state: {
          in: ["LIVE", "SCHEDULED"],
        },
      },
      include: {
        vehicle: {
          select: {
            brand: true,
            model: true,
            year: true,
            mileage: true,
            bodyType: true,
          },
        },
      },
      orderBy: [{ endsAt: "asc" }, { id: "asc" }],
      take: 4,
    }),
    prisma.bid.aggregate({
      where: {
        auctionId: auction.id,
      },
      _max: {
        amount: true,
      },
    }),
    prisma.bid.count({
      where: {
        auctionId: auction.id,
      },
    }),
  ]);

  const vehicle = auction.vehicle;
  const currentPrice = Number(auction.currentPrice.toString());
  const minIncrement = Number(auction.minIncrement.toString());
  const currentBid = currentPrice;
  const buyNowPrice = vehicle?.marketPrice ? Number(vehicle.marketPrice.toString()) : 0;

  return json(200, {
    id: auction.id,
    state: auction.state,
    sellerCompanyId: auction.sellerCompanyId,
    vehicleId: auction.vehicleId,
    startsAt: auction.startsAt.toISOString(),
    endsAt: auction.endsAt.toISOString(),
    currentBid,
    currentPrice,
    minIncrement,
    buyNowPrice,
    totalBids,
    sellerName: company?.name ?? "Fleet Operator",
    sellerRef: company?.registrationNumber ?? "",
    location: "UAE, Dubai",
    actualCashValue: vehicle?.marketPrice ? Number(vehicle.marketPrice.toString()) : 0,
    highestBid: decimalToNumber(highestBid._max.amount),
    vehicle: vehicle
      ? {
          id: vehicle.id,
          vin: vehicle.vin,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          mileage: vehicle.mileage,
          fuelType: vehicle.fuelType,
          transmission: vehicle.transmission,
          bodyType: vehicle.bodyType,
          regionSpec: vehicle.regionSpec,
          condition: vehicle.condition,
          serviceHistory: vehicle.serviceHistory,
          sellerNotes: vehicle.sellerNotes,
          engine: null,
          driveType: null,
          series: null,
          exteriorColor: null,
          interiorColor: null,
          features: [],
          highlights: [],
          images: [],
        }
      : null,
    bids: bids.map((bid) => ({
      id: bid.id,
      amount: Number(bid.amount.toString()),
      sequenceNo: bid.sequenceNo,
      createdAt: bid.createdAt.toISOString(),
      userId: bid.userId,
    })),
    similar: similarAuctions.map((similarAuction) => ({
      id: similarAuction.id,
      state: similarAuction.state,
      currentPrice: Number(similarAuction.currentPrice.toString()),
      startsAt: similarAuction.startsAt.toISOString(),
      endsAt: similarAuction.endsAt.toISOString(),
      vehicle: similarAuction.vehicle
        ? {
            brand: similarAuction.vehicle.brand,
            model: similarAuction.vehicle.model,
            year: similarAuction.vehicle.year,
            mileage: similarAuction.vehicle.mileage,
            bodyType: similarAuction.vehicle.bodyType,
          }
        : null,
    })),
  });
}
