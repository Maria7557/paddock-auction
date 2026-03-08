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
  });

  if (!auction) {
    return json(404, {
      error: "AUCTION_NOT_FOUND",
    });
  }

  const [vehicle, highestBid] = await Promise.all([
    prisma.vehicle.findUnique({
      where: {
        id: auction.vehicleId,
      },
    }),
    prisma.bid.aggregate({
      where: {
        auctionId: auction.id,
      },
      _max: {
        amount: true,
      },
    }),
  ]);

  return json(200, {
    id: auction.id,
    state: auction.state,
    sellerCompanyId: auction.sellerCompanyId,
    vehicleId: auction.vehicleId,
    startsAt: auction.startsAt.toISOString(),
    endsAt: auction.endsAt.toISOString(),
    currentBid: Number(auction.currentPrice.toString()),
    minIncrement: Number(auction.minIncrement.toString()),
    highestBid: decimalToNumber(highestBid._max.amount),
    vehicle: vehicle
      ? {
          id: vehicle.id,
          vin: vehicle.vin,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          mileage: vehicle.mileage,
        }
      : null,
  });
}
