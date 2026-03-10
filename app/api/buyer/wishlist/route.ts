export const runtime = "nodejs";

import prisma from "@/src/infrastructure/database/prisma";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// GET /api/buyer/wishlist — list saved lots for current user
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get("x-user-id")?.trim();
  if (!userId) return json(401, { error: "UNAUTHORIZED" });

  const saved = await prisma.savedLot.findMany({
    where: { userId },
    include: {
      auction: {
        include: { vehicle: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return json(200, {
    items: saved.map((s) => ({
      id: s.id,
      auctionId: s.auctionId,
      savedAt: s.createdAt.toISOString(),
      auction: {
        id: s.auction.id,
        state: s.auction.state,
        currentPrice: Number(s.auction.currentPrice),
        endsAt: s.auction.endsAt.toISOString(),
        vehicle: s.auction.vehicle
          ? {
              brand: s.auction.vehicle.brand,
              model: s.auction.vehicle.model,
              year: s.auction.vehicle.year,
              mileage: s.auction.vehicle.mileage,
            }
          : null,
      },
    })),
  });
}
