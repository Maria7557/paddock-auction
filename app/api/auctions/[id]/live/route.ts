export const runtime = "nodejs";

import prisma from "@/src/infrastructure/database/prisma";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function getUserCompanyId(userId: string): Promise<string | null> {
  const companyUser = await prisma.companyUser.findFirst({
    where: { userId },
    select: { companyId: true },
  });

  return companyUser?.companyId ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const userId = request.headers.get("x-user-id");

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      bids: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!auction) {
    return json(404, { error: "AUCTION_NOT_FOUND" });
  }

  const uniqueBidders = await prisma.bid.findMany({
    where: { auctionId: id },
    distinct: ["userId"],
    select: {
      userId: true,
    },
  });

  const bidderUserIds = uniqueBidders.map((bid) => bid.userId);

  const bidderUsers = bidderUserIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: bidderUserIds,
          },
        },
        select: {
          id: true,
          emirate: true,
        },
      })
    : [];

  const emirateCounts: Record<string, number> = {};

  for (const bidder of bidderUsers) {
    const emirate = bidder.emirate ?? "Other";
    emirateCounts[emirate] = (emirateCounts[emirate] ?? 0) + 1;
  }

  const participantsByEmirate = Object.entries(emirateCounts)
    .map(([emirate, count]) => ({ emirate, count }))
    .sort((a, b) => b.count - a.count);

  const totalParticipants = uniqueBidders.length;

  const lastBid = auction.bids[0] ?? null;
  let lastBidder: {
    emirate: string;
    companyName: string;
    amount: number;
    placedAt: string;
  } | null = null;

  if (lastBid) {
    const [bidderUser, company] = await Promise.all([
      prisma.user.findUnique({
        where: { id: lastBid.userId },
        select: { emirate: true },
      }),
      prisma.company.findUnique({
        where: { id: lastBid.companyId },
        select: { name: true },
      }),
    ]);

    lastBidder = {
      emirate: bidderUser?.emirate ?? "UAE",
      companyName: company?.name ?? "Unknown",
      amount: Number(auction.currentPrice),
      placedAt: lastBid.createdAt.toISOString(),
    };
  }

  const currentUserCompanyId = userId ? await getUserCompanyId(userId) : null;
  const isWinner =
    auction.state === "CLOSED" &&
    auction.winnerCompanyId !== null &&
    currentUserCompanyId !== null &&
    auction.winnerCompanyId === currentUserCompanyId;

  return json(200, {
    auctionId: auction.id,
    state: auction.state,
    currentPrice: Number(auction.currentPrice),
    minIncrement: Number(auction.minIncrement),
    nextBidAmount: Number(auction.currentPrice) + Number(auction.minIncrement),
    endsAt: auction.endsAt.toISOString(),
    lastBidder,
    participantsByEmirate,
    totalParticipants,
    winnerId: auction.winnerCompanyId,
    isWinner,
  });
}
