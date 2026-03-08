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

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!company) {
    return json(404, {
      error: "COMPANY_NOT_FOUND",
    });
  }

  const auctions = await prisma.auction.findMany({
    where: {
      sellerCompanyId: companyId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  const vehicleIds = [...new Set(auctions.map((auction) => auction.vehicleId))];
  const vehiclesTotal = vehicleIds.length;
  const withActiveAuction = new Set(
    auctions
      .filter((auction) => ["SCHEDULED", "LIVE", "EXTENDED"].includes(auction.state))
      .map((auction) => auction.vehicleId),
  ).size;
  const sold = auctions.filter((auction) => auction.state === "PAID").length;

  const auctionsByState = auctions.reduce<Record<string, number>>((accumulator, auction) => {
    accumulator[auction.state] = (accumulator[auction.state] ?? 0) + 1;
    return accumulator;
  }, {});

  const recentAuctions = auctions.slice(0, 5);

  const recentVehicles = recentAuctions.length
    ? await prisma.vehicle.findMany({
        where: {
          id: {
            in: recentAuctions.map((auction) => auction.vehicleId),
          },
        },
      })
    : [];

  const vehicleById = new Map(recentVehicles.map((vehicle) => [vehicle.id, vehicle]));

  return json(200, {
    company: {
      id: company.id,
      name: company.name,
      status: company.status,
      pendingApproval: company.status !== "ACTIVE",
    },
    stats: {
      vehicles: {
        total: vehiclesTotal,
        withActiveAuction,
        sold,
      },
      auctions: {
        draft: auctionsByState.DRAFT ?? 0,
        scheduled: auctionsByState.SCHEDULED ?? 0,
        live: auctionsByState.LIVE ?? 0,
        closed: auctionsByState.CLOSED ?? 0,
        paymentPending: auctionsByState.PAYMENT_PENDING ?? 0,
      },
    },
    recentAuctions: recentAuctions.map((auction) => {
      const vehicle = vehicleById.get(auction.vehicleId);

      return {
        id: auction.id,
        state: auction.state,
        currentBid: decimalToNumber(auction.currentPrice),
        startsAt: auction.startsAt.toISOString(),
        endsAt: auction.endsAt.toISOString(),
        vehicleName: vehicle ? `${vehicle.brand} ${vehicle.model}` : auction.vehicleId,
      };
    }),
  });
}
