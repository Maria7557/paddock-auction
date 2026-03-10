export const runtime = "nodejs";

import prisma from "@/src/infrastructure/database/prisma";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type RouteContext = { params: Promise<{ auctionId: string }> };

// POST — save lot
export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const userId = req.headers.get("x-user-id")?.trim();
  if (!userId) return json(401, { error: "UNAUTHORIZED" });

  const { auctionId } = await ctx.params;

  const auction = await prisma.auction.findUnique({ where: { id: auctionId }, select: { id: true } });
  if (!auction) return json(404, { error: "AUCTION_NOT_FOUND" });

  await prisma.savedLot.upsert({
    where: { userId_auctionId: { userId, auctionId } },
    update: {},
    create: { userId, auctionId },
  });

  return json(201, { saved: true, auctionId });
}

// DELETE — unsave lot
export async function DELETE(req: Request, ctx: RouteContext): Promise<Response> {
  const userId = req.headers.get("x-user-id")?.trim();
  if (!userId) return json(401, { error: "UNAUTHORIZED" });

  const { auctionId } = await ctx.params;

  await prisma.savedLot.deleteMany({ where: { userId, auctionId } });

  return json(200, { saved: false, auctionId });
}
