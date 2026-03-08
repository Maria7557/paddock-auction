export const runtime = "nodejs";

import { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

export async function GET(request: Request): Promise<Response> {
  const userRole = request.headers.get("x-user-role")?.trim();

  if (userRole !== "SELLER") {
    return json(403, {
      error: "SELLERS_ONLY",
    });
  }

  const companyId = request.headers.get("x-company-id")?.trim();

  if (!companyId) {
    return json(401, {
      error: "UNAUTHORIZED",
    });
  }

  const auctions = await prisma.auction.findMany({
    where: {
      sellerCompanyId: companyId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  const latestAuctionByVehicleId = new Map<string, (typeof auctions)[number]>();

  for (const auction of auctions) {
    if (!latestAuctionByVehicleId.has(auction.vehicleId)) {
      latestAuctionByVehicleId.set(auction.vehicleId, auction);
    }
  }

  const vehicleIds = [...latestAuctionByVehicleId.keys()];

  const vehicles = vehicleIds.length
    ? await prisma.vehicle.findMany({
        where: {
          id: {
            in: vehicleIds,
          },
        },
        orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }, { id: "asc" }],
      })
    : [];

  return json(200, {
    vehicles: vehicles.map((vehicle) => {
      const latestAuction = latestAuctionByVehicleId.get(vehicle.id) ?? null;

      return {
        id: vehicle.id,
        vin: vehicle.vin,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        mileage: vehicle.mileage,
        latestAuction: latestAuction
          ? {
              id: latestAuction.id,
              state: latestAuction.state,
              startsAt: latestAuction.startsAt.toISOString(),
              endsAt: latestAuction.endsAt.toISOString(),
              currentBid: decimalToNumber(latestAuction.currentPrice),
            }
          : null,
      };
    }),
  });
}
