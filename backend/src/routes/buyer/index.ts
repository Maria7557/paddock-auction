import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../../db";
import { loadBuyerAccessContext, requireAuth } from "../../lib/auth";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
      toString?: () => string;
    };

type DashboardMetrics = {
  activeBids: number;
  watching: number;
  watchlistCount: number;
  invoicesDue: number;
  depositBalance: number;
  depositLocked: number;
  depositBalanceAed: number;
};

type DepositStatusResponse = {
  requiredAmountAed: number;
  balanceAed: number;
  lockedBalanceAed: number;
  availableBalanceAed: number;
  hasRequiredDeposit: boolean;
};

type DashboardActivity = {
  type: "winning" | "outbid" | "watched";
  lotTitle: string;
  amount?: number;
  timeAgo: string;
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

type LotSummary = {
  id: string;
  state: string;
  currentPrice: number;
  minIncrement: number;
  startingPrice: number;
  buyNowPrice: number | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
  sellerName: string;
  location: string;
  totalBids: number;
  isWatchlisted: boolean;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number;
    mileage: number;
    marketPrice: number | null;
    fuelType: string | null;
    transmission: string | null;
    bodyType: string | null;
    regionSpec: string | null;
    condition: string | null;
    images: string[];
  };
};

type RecommendedLot = {
  id: string;
  title: string;
  currentBid: number;
  status: string;
  imageUrl?: string;
};

type VipStatusResponse = {
  tier: "STANDARD" | "VIP";
  upgradeRequest: {
    status: string;
    requestedAt: string;
  } | null;
};

type BuyerDashboardResponse = {
  metrics: DashboardMetrics;
  depositStatus: DepositStatusResponse;
  onboardingStep: 1 | 2 | 3 | 4;
  recentActivity: DashboardActivity[];
  recommendedLots: RecommendedLot[];
  vipStatus: VipStatusResponse;
};

type BuyerWatchlistResponse = {
  lots: LotSummary[];
  nextCursor: string | null;
};

type BuyerBidItemStatus = "WINNING" | "OUTBID" | "WON_PAYMENT_DUE" | "PAID";

type BuyerBidItem = {
  auctionId: string;
  lotNumber: string;
  lotTitle: string;
  city: string;
  startsAt: string | null;
  endsAt: string | null;
  currentBid: number;
  myBid: number;
  status: BuyerBidItemStatus;
  invoiceId: string | null;
};

type BuyerMyBidsResponse = {
  items: BuyerBidItem[];
};

const watchlistQuerySchema = z
  .object({
    status: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    minPrice: z.coerce.number().finite().nonnegative().optional(),
    maxPrice: z.coerce.number().finite().nonnegative().optional(),
    sort: z.enum(["ending_soon", "newest", "price_asc", "price_desc"]).default("ending_soon"),
    limit: z.coerce.number().int().positive().max(50).default(20),
    cursor: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPrice"],
        message: "Maximum price must be greater than or equal to minimum price.",
      });
    }
  });

const lotIdParamsSchema = z.object({
  lotId: z.string().trim().min(1),
});

async function toNumberValue(value: DecimalLike): Promise<number> {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (value && typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unable to convert value to number");
}

async function toIsoString(value: Date | string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Unable to convert value to ISO string");
  }

  return parsed.toISOString();
}

async function sendValidationError(
  reply: FastifyReply,
  issues: Array<{ path: string; message: string }>,
): Promise<void> {
  await reply.code(400).send({
    error: "INVALID_REQUEST",
    issues,
  });
}

async function sendUnauthorized(reply: FastifyReply): Promise<void> {
  await reply.code(401).send({
    error: "Unauthorized",
  });
}

async function requireBuyerContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{
  userId: string;
  companyId: string;
  userStatus: string;
  companyStatus: string;
  kycVerified: boolean;
} | null> {
  const context = await loadBuyerAccessContext(request);

  if (!context) {
    await sendUnauthorized(reply);
    return null;
  }

  return context;
}

function formatActivityAed(amountAed: number): string {
  return `AED ${new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(amountAed)}`;
}

function formatTimeAgo(value: Date): string {
  const diffMs = Date.now() - value.getTime();

  if (diffMs < 60_000) {
    return "Just now";
  }

  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function buildLotTitle(brand: string | null | undefined, model: string | null | undefined, fallbackId: string): string {
  const parts = [brand?.trim(), model?.trim()].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return `Lot ${fallbackId.slice(0, 8).toUpperCase()}`;
}

function buildLotNumber(lotId: string): string {
  return `Lot ${lotId.slice(0, 8).toUpperCase()}`;
}

function normalizeStatusValue(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function isLiveAuctionState(value: string): boolean {
  const normalized = normalizeStatusValue(value);
  return normalized === "LIVE" || normalized === "EXTENDED";
}

function applyLotFilters(
  lots: LotSummary[],
  filters: z.infer<typeof watchlistQuerySchema>,
): LotSummary[] {
  return lots.filter((lot) => {
    if (filters.status && normalizeStatusValue(lot.state) !== normalizeStatusValue(filters.status)) {
      return false;
    }

    if (
      filters.city &&
      !lot.location.toLowerCase().includes(filters.city.trim().toLowerCase())
    ) {
      return false;
    }

    if (filters.minPrice !== undefined && lot.currentPrice < filters.minPrice) {
      return false;
    }

    if (filters.maxPrice !== undefined && lot.currentPrice > filters.maxPrice) {
      return false;
    }

    return true;
  });
}

function sortLots(
  lots: LotSummary[],
  sort: z.infer<typeof watchlistQuerySchema>["sort"],
): LotSummary[] {
  return [...lots].sort((left, right) => {
    if (sort === "newest") {
      return new Date(right.startsAt ?? 0).getTime() - new Date(left.startsAt ?? 0).getTime();
    }

    if (sort === "price_asc") {
      return left.currentPrice - right.currentPrice;
    }

    if (sort === "price_desc") {
      return right.currentPrice - left.currentPrice;
    }

    return (
      new Date(left.endsAt ?? left.startsAt ?? 0).getTime() -
      new Date(right.endsAt ?? right.startsAt ?? 0).getTime()
    );
  });
}

function paginateLots(
  lots: LotSummary[],
  limit: number,
  cursor?: string,
): { pageItems: LotSummary[]; nextCursor: string | null } {
  const startIndex = cursor ? Math.max(lots.findIndex((lot) => lot.id === cursor) + 1, 0) : 0;
  const pageItems = lots.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < lots.length ? pageItems[pageItems.length - 1]?.id ?? null : null;

  return {
    pageItems,
    nextCursor,
  };
}

async function serializeLotSummary(
  auction: {
    id: string;
    state: string;
    currentPrice: DecimalLike;
    minIncrement: DecimalLike;
    startingPrice: DecimalLike;
    buyNowPrice: DecimalLike | null;
    startsAt: Date;
    endsAt: Date;
    createdAt: Date;
    sellerCompanyId: string;
    vehicle: {
      id: string;
      brand: string;
      model: string;
      year: number;
      mileage: number;
      marketPrice: DecimalLike | null;
      fuelType: string | null;
      transmission: string | null;
      bodyType: string | null;
      regionSpec: string | null;
      condition: string | null;
      images: string[];
    };
    _count?: {
      bids?: number;
    };
  },
  companyById: Map<string, { name: string; country: string }>,
  isWatchlisted: boolean,
  viewerTier: "STANDARD" | "VIP",
): Promise<LotSummary> {
  const company = companyById.get(auction.sellerCompanyId);

  return {
    id: auction.id,
    state: auction.state,
    currentPrice: await toNumberValue(auction.currentPrice),
    minIncrement: await toNumberValue(auction.minIncrement),
    startingPrice: await toNumberValue(auction.startingPrice),
    buyNowPrice:
      viewerTier === "VIP" && auction.buyNowPrice !== null ? await toNumberValue(auction.buyNowPrice) : null,
    startsAt: await toIsoString(auction.startsAt),
    endsAt: await toIsoString(auction.endsAt),
    createdAt: await toIsoString(auction.createdAt),
    sellerName: company?.name ?? "Verified Seller",
    location: company?.country ?? "UAE",
    totalBids: auction._count?.bids ?? 0,
    isWatchlisted,
    vehicle: {
      id: auction.vehicle.id,
      brand: auction.vehicle.brand,
      model: auction.vehicle.model,
      year: auction.vehicle.year,
      mileage: auction.vehicle.mileage,
      marketPrice:
        auction.vehicle.marketPrice === null ? null : await toNumberValue(auction.vehicle.marketPrice),
      fuelType: auction.vehicle.fuelType,
      transmission: auction.vehicle.transmission,
      bodyType: auction.vehicle.bodyType,
      regionSpec: auction.vehicle.regionSpec,
      condition: auction.vehicle.condition,
      images: auction.vehicle.images,
    },
  };
}

async function loadSellerCompanyLookup(companyIds: string[]): Promise<Map<string, { name: string; country: string }>> {
  if (companyIds.length === 0) {
    return new Map();
  }

  const companies = await prisma.company.findMany({
    where: {
      id: {
        in: companyIds,
      },
    },
    select: {
      id: true,
      name: true,
      country: true,
    },
  });

  return new Map(companies.map((company) => [company.id, { name: company.name, country: company.country }]));
}

export async function buyerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireAuth);

  fastify.get(
    "/buyer/dashboard",
    async function buyerDashboardHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      if (reply.sent) {
        return;
      }

      const buyerContext = await requireBuyerContext(request, reply);

      if (!buyerContext) {
        return;
      }

      const issuedInvoiceWhere = {
        buyerCompanyId: buyerContext.companyId,
        status: "ISSUED" as const,
      };

      const [
        activeBidAuctions,
        bids,
        savedLots,
        wallet,
        invoicesDue,
        recentIssuedInvoices,
      ] = await Promise.all([
        prisma.bid.findMany({
          where: {
            userId: buyerContext.userId,
            auction: {
              state: "LIVE",
            },
          },
          distinct: ["auctionId"],
          select: {
            auctionId: true,
          },
        }),
        prisma.bid.findMany({
          where: {
            userId: buyerContext.userId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 200,
          select: {
            id: true,
            auctionId: true,
            amount: true,
            createdAt: true,
            auction: {
              select: {
                id: true,
                state: true,
                highestBidId: true,
                currentPrice: true,
                vehicle: {
                  select: {
                    brand: true,
                    model: true,
                  },
                },
              },
            },
          },
        }),
        prisma.savedLot.findMany({
          where: {
            userId: buyerContext.userId,
          },
          select: {
            id: true,
            auctionId: true,
            createdAt: true,
            auction: {
              select: {
                vehicle: {
                  select: {
                    brand: true,
                    model: true,
                  },
                },
              },
            },
          },
        }),
        prisma.wallet.findUnique({
          where: {
            userId: buyerContext.userId,
          },
          select: {
            balance: true,
            lockedBalance: true,
          },
        }),
        prisma.invoice.count({
          where: issuedInvoiceWhere,
        }),
        prisma.invoice.findMany({
          where: issuedInvoiceWhere,
          orderBy: {
            issuedAt: "desc",
          },
          take: 6,
          select: {
            id: true,
            issuedAt: true,
            auctionId: true,
          },
        }),
      ]);

      const bidsByAuction = new Map<
        string,
        {
          auctionId: string;
          lotTitle: string;
          state: string;
          highestBidId: string | null;
          currentPriceAed: number;
          latestBidAt: Date;
          myHighestBidAed: number;
          myBidIds: Set<string>;
        }
      >();

      for (const bid of bids) {
        const bidAmountAed = await toNumberValue(bid.amount);
        const currentPriceAed = await toNumberValue(bid.auction.currentPrice);
        const lotTitle = buildLotTitle(
          bid.auction.vehicle?.brand,
          bid.auction.vehicle?.model,
          bid.auction.id,
        );
        const existing = bidsByAuction.get(bid.auctionId);

        if (!existing) {
          bidsByAuction.set(bid.auctionId, {
            auctionId: bid.auctionId,
            lotTitle,
            state: bid.auction.state,
            highestBidId: bid.auction.highestBidId,
            currentPriceAed,
            latestBidAt: bid.createdAt,
            myHighestBidAed: bidAmountAed,
            myBidIds: new Set([bid.id]),
          });
          continue;
        }

        existing.myHighestBidAed = Math.max(existing.myHighestBidAed, bidAmountAed);
        existing.currentPriceAed = currentPriceAed;
        existing.highestBidId = bid.auction.highestBidId;
        existing.state = bid.auction.state;
        existing.myBidIds.add(bid.id);

        if (bid.createdAt > existing.latestBidAt) {
          existing.latestBidAt = bid.createdAt;
        }
      }

      const bidActivities: DashboardActivity[] = [];

      for (const auctionSummary of bidsByAuction.values()) {
        const isWinning = auctionSummary.highestBidId
          ? auctionSummary.myBidIds.has(auctionSummary.highestBidId)
          : false;

        if (auctionSummary.state === "LIVE" && !isWinning) {
          bidActivities.push({
            type: "outbid",
            lotTitle: auctionSummary.lotTitle,
            amount: auctionSummary.currentPriceAed,
            timeAgo: formatTimeAgo(auctionSummary.latestBidAt),
            id: `activity-outbid-${auctionSummary.auctionId}`,
            title: "You were outbid",
            detail: `${auctionSummary.lotTitle} moved to ${formatActivityAed(auctionSummary.currentPriceAed)}`,
            createdAt: auctionSummary.latestBidAt.toISOString(),
          });
          continue;
        }

        if (isWinning) {
          bidActivities.push({
            type: "winning",
            lotTitle: auctionSummary.lotTitle,
            amount: auctionSummary.myHighestBidAed,
            timeAgo: formatTimeAgo(auctionSummary.latestBidAt),
            id: `activity-winning-${auctionSummary.auctionId}`,
            title: "You're leading",
            detail: `${auctionSummary.lotTitle} accepted at ${formatActivityAed(auctionSummary.myHighestBidAed)}`,
            createdAt: auctionSummary.latestBidAt.toISOString(),
          });
        }
      }

      const watchedActivities: DashboardActivity[] = savedLots.map((savedLot) => {
        const lotTitle = buildLotTitle(
          savedLot.auction.vehicle?.brand,
          savedLot.auction.vehicle?.model,
          savedLot.auctionId,
        );

        return {
          type: "watched",
          lotTitle,
          timeAgo: formatTimeAgo(savedLot.createdAt),
          id: `activity-watched-${savedLot.id}`,
          title: "Added to watchlist",
          detail: lotTitle,
          createdAt: savedLot.createdAt.toISOString(),
        };
      });

      const recentActivity = [...bidActivities, ...watchedActivities]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 5);

      const balanceAed = wallet ? await toNumberValue(wallet.balance) : 0;
      const lockedBalanceAed = wallet ? await toNumberValue(wallet.lockedBalance) : 0;
      const availableBalanceAed = Number((balanceAed - lockedBalanceAed).toFixed(2));
      const hasRequiredDeposit = availableBalanceAed >= 5000;
      const [buyerCompany, latestUpgradeRequest] = await Promise.all([
        prisma.company.findUnique({
          where: {
            id: buyerContext.companyId,
          },
          select: {
            buyerTier: true,
          },
        }),
        prisma.vipUpgradeRequest.findFirst({
          where: {
            companyId: buyerContext.companyId,
          },
          orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
          select: {
            status: true,
            requestedAt: true,
          },
        }),
      ]);
      const buyerTier = buyerCompany?.buyerTier === "VIP" ? "VIP" : "STANDARD";
      const isVerified =
        buyerContext.kycVerified === true &&
        normalizeStatusValue(buyerContext.userStatus) === "ACTIVE" &&
        normalizeStatusValue(buyerContext.companyStatus) === "ACTIVE";
      const hasActivity =
        activeBidAuctions.length > 0 ||
        bids.length > 0 ||
        savedLots.length > 0 ||
        recentIssuedInvoices.length > 0;
      const savedAuctionIds = new Set(savedLots.map((entry) => entry.auctionId));

      let onboardingStep: 1 | 2 | 3 | 4 = 1;

      if (isVerified && !hasRequiredDeposit) {
        onboardingStep = 2;
      }

      if (isVerified && hasRequiredDeposit) {
        onboardingStep = hasActivity ? 4 : 3;
      }

      let recommendedLots: RecommendedLot[] = [];

      if (activeBidAuctions.length === 0) {
        const auctions = await prisma.auction.findMany({
          where: {
            state: {
              in: ["LIVE", "SCHEDULED"],
            },
            transitions: {
              none: {
                trigger: "EVENT_META",
              },
            },
          },
          include: {
            vehicle: true,
            _count: {
              select: {
                bids: true,
              },
            },
          },
          orderBy: [{ endsAt: "asc" }, { createdAt: "desc" }, { id: "desc" }],
          take: 3,
        });
        const companyLookup = await loadSellerCompanyLookup(
          Array.from(new Set(auctions.map((auction) => auction.sellerCompanyId))),
        );

        const serializedLots = await Promise.all(
          auctions.map((auction) =>
            serializeLotSummary(auction, companyLookup, savedAuctionIds.has(auction.id), buyerTier),
          ),
        );

        recommendedLots = serializedLots.map((lot) => ({
          id: lot.id,
          title: buildLotTitle(lot.vehicle.brand, lot.vehicle.model, lot.id),
          currentBid: lot.currentPrice,
          status: lot.state,
          imageUrl: lot.vehicle.images[0],
        }));
      }

      const responseBody: BuyerDashboardResponse = {
        metrics: {
          activeBids: activeBidAuctions.length,
          watching: savedLots.length,
          watchlistCount: savedLots.length,
          invoicesDue,
          depositBalance: availableBalanceAed,
          depositLocked: lockedBalanceAed,
          depositBalanceAed: balanceAed,
        },
        depositStatus: {
          requiredAmountAed: 5000,
          balanceAed,
          lockedBalanceAed,
          availableBalanceAed,
          hasRequiredDeposit,
        },
        onboardingStep,
        recentActivity,
        recommendedLots,
        vipStatus: {
          tier: buyerTier,
          upgradeRequest: latestUpgradeRequest
            ? {
                status: latestUpgradeRequest.status,
                requestedAt: latestUpgradeRequest.requestedAt.toISOString(),
              }
            : null,
        },
      };

      await reply.code(200).send(responseBody);
    },
  );

  fastify.get(
    "/buyer/my-bids",
    async function buyerMyBidsHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      if (reply.sent) {
        return;
      }

      const buyerContext = await requireBuyerContext(request, reply);

      if (!buyerContext) {
        return;
      }

      const bids = await prisma.bid.findMany({
        where: {
          userId: buyerContext.userId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          auctionId: true,
          amount: true,
          createdAt: true,
          auction: {
            select: {
              id: true,
              state: true,
              highestBidId: true,
              currentPrice: true,
              sellerCompanyId: true,
              startsAt: true,
              endsAt: true,
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                },
              },
            },
          },
        },
      });

      if (bids.length === 0) {
        const emptyResponse: BuyerMyBidsResponse = {
          items: [],
        };

        await reply.code(200).send(emptyResponse);
        return;
      }

      const groupedBids = new Map<
        string,
        {
          auctionId: string;
          lotTitle: string;
          state: string;
          highestBidId: string | null;
          currentBid: number;
          myBid: number;
          sellerCompanyId: string;
          startsAt: Date;
          endsAt: Date;
          bidIds: Set<string>;
        }
      >();

      for (const bid of bids) {
        const bidAmount = await toNumberValue(bid.amount);
        const currentBid = await toNumberValue(bid.auction.currentPrice);
        const lotTitle = buildLotTitle(
          bid.auction.vehicle?.brand,
          bid.auction.vehicle?.model,
          bid.auction.id,
        );
        const existing = groupedBids.get(bid.auctionId);

        if (!existing) {
          groupedBids.set(bid.auctionId, {
            auctionId: bid.auctionId,
            lotTitle,
            state: bid.auction.state,
            highestBidId: bid.auction.highestBidId,
            currentBid,
            myBid: bidAmount,
            sellerCompanyId: bid.auction.sellerCompanyId,
            startsAt: bid.auction.startsAt,
            endsAt: bid.auction.endsAt,
            bidIds: new Set([bid.id]),
          });
          continue;
        }

        existing.myBid = Math.max(existing.myBid, bidAmount);
        existing.currentBid = currentBid;
        existing.state = bid.auction.state;
        existing.highestBidId = bid.auction.highestBidId;
        existing.bidIds.add(bid.id);
      }

      const auctionIds = Array.from(groupedBids.keys());
      const companyLookup = await loadSellerCompanyLookup(
        Array.from(new Set(Array.from(groupedBids.values()).map((entry) => entry.sellerCompanyId))),
      );
      const invoices = await prisma.invoice.findMany({
        where: {
          buyerCompanyId: buyerContext.companyId,
          auctionId: {
            in: auctionIds,
          },
          status: {
            in: ["ISSUED", "PAID", "DEFAULTED"],
          },
        },
        select: {
          id: true,
          auctionId: true,
          status: true,
          dueAt: true,
        },
      });
      const invoiceByAuctionId = new Map(invoices.map((invoice) => [invoice.auctionId, invoice]));

      const items = Array.from(groupedBids.values())
        .map<BuyerBidItem | null>((entry) => {
          const invoice = invoiceByAuctionId.get(entry.auctionId);
          const isWinning = entry.highestBidId ? entry.bidIds.has(entry.highestBidId) : false;
          const city = companyLookup.get(entry.sellerCompanyId)?.country ?? "UAE";
          let status: BuyerBidItemStatus | null = null;

          if (invoice?.status === "PAID") {
            status = "PAID";
          } else if (invoice && (invoice.status === "ISSUED" || invoice.status === "DEFAULTED")) {
            status = "WON_PAYMENT_DUE";
          } else if (isLiveAuctionState(entry.state)) {
            status = isWinning ? "WINNING" : "OUTBID";
          }

          if (!status) {
            return null;
          }

          return {
            auctionId: entry.auctionId,
            lotNumber: buildLotNumber(entry.auctionId),
            lotTitle: entry.lotTitle,
            city,
            startsAt: entry.startsAt.toISOString(),
            endsAt: entry.endsAt.toISOString(),
            currentBid: entry.currentBid,
            myBid: entry.myBid,
            status,
            invoiceId: invoice?.id ?? null,
          };
        })
        .filter((item): item is BuyerBidItem => item !== null)
        .sort((left, right) => {
          const priority = (value: BuyerBidItemStatus): number => {
            if (value === "WON_PAYMENT_DUE") {
              return 0;
            }

            if (value === "OUTBID") {
              return 1;
            }

            if (value === "WINNING") {
              return 2;
            }

            return 3;
          };

          const priorityDelta = priority(left.status) - priority(right.status);

          if (priorityDelta !== 0) {
            return priorityDelta;
          }

          return new Date(left.endsAt ?? left.startsAt ?? 0).getTime() -
            new Date(right.endsAt ?? right.startsAt ?? 0).getTime();
        });

      const responseBody: BuyerMyBidsResponse = {
        items,
      };

      await reply.code(200).send(responseBody);
    },
  );

  fastify.get<{ Querystring: unknown }>(
    "/buyer/watchlist",
    async function buyerWatchlistHandler(
      request: FastifyRequest<{ Querystring: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      if (reply.sent) {
        return;
      }

      const buyerContext = await requireBuyerContext(request, reply);

      if (!buyerContext) {
        return;
      }

      const parsedQuery = watchlistQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(
          reply,
          parsedQuery.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const savedLots = await prisma.savedLot.findMany({
        where: {
          userId: buyerContext.userId,
        },
        include: {
          auction: {
            include: {
              vehicle: true,
              _count: {
                select: {
                  bids: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const companyLookup = await loadSellerCompanyLookup(
        Array.from(new Set(savedLots.map((savedLot) => savedLot.auction.sellerCompanyId))),
      );
      const buyerCompany = await prisma.company.findUnique({
        where: {
          id: buyerContext.companyId,
        },
        select: {
          buyerTier: true,
        },
      });
      const buyerTier = buyerCompany?.buyerTier === "VIP" ? "VIP" : "STANDARD";

      const lotSummaries = await Promise.all(
        savedLots.map((savedLot) => serializeLotSummary(savedLot.auction, companyLookup, true, buyerTier)),
      );
      const filteredLots = applyLotFilters(lotSummaries, parsedQuery.data);
      const sortedLots = sortLots(filteredLots, parsedQuery.data.sort);
      const { pageItems, nextCursor } = paginateLots(
        sortedLots,
        parsedQuery.data.limit,
        parsedQuery.data.cursor,
      );

      const responseBody: BuyerWatchlistResponse = {
        lots: pageItems,
        nextCursor,
      };

      await reply.code(200).send(responseBody);
    },
  );

  fastify.post<{ Params: unknown }>(
    "/buyer/watchlist/:lotId",
    async function buyerWatchlistToggleHandler(
      request: FastifyRequest<{ Params: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      if (reply.sent) {
        return;
      }

      const buyerContext = await requireBuyerContext(request, reply);

      if (!buyerContext) {
        return;
      }

      const parsedParams = lotIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(
          reply,
          parsedParams.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const { lotId } = parsedParams.data;
      const existing = await prisma.savedLot.findFirst({
        where: {
          userId: buyerContext.userId,
          auctionId: lotId,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        await prisma.savedLot.delete({
          where: {
            id: existing.id,
          },
        });

        await reply.code(200).send({
          watchlisted: false,
        });
        return;
      }

      const auction = await prisma.auction.findUnique({
        where: {
          id: lotId,
        },
        select: {
          id: true,
        },
      });

      if (!auction) {
        await reply.code(404).send({
          error: "LOT_NOT_FOUND",
        });
        return;
      }

      await prisma.savedLot.create({
        data: {
          id: randomUUID(),
          userId: buyerContext.userId,
          auctionId: lotId,
        },
      });

      await reply.code(200).send({
        watchlisted: true,
      });
    },
  );

  fastify.post(
    "/buyer/vip-request",
    async function buyerVipRequestHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      if (reply.sent) {
        return;
      }

      const buyerContext = await requireBuyerContext(request, reply);

      if (!buyerContext) {
        return;
      }

      const existingRequest = await prisma.vipUpgradeRequest.findFirst({
        where: {
          companyId: buyerContext.companyId,
          status: "PENDING",
        },
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      });

      if (existingRequest) {
        await reply.code(200).send({
          requestId: existingRequest.id,
          status: "PENDING" as const,
        });
        return;
      }

      const createdRequest = await prisma.vipUpgradeRequest.create({
        data: {
          id: randomUUID(),
          companyId: buyerContext.companyId,
          status: "PENDING",
        },
      });

      await reply.code(201).send({
        requestId: createdRequest.id,
        status: "PENDING" as const,
      });
    },
  );

  fastify.get(
    "/buyer/vip-status",
    async function buyerVipStatusHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      if (reply.sent) {
        return;
      }

      const buyerContext = await requireBuyerContext(request, reply);

      if (!buyerContext) {
        return;
      }

      const [company, latestRequest] = await Promise.all([
        prisma.company.findUnique({
          where: {
            id: buyerContext.companyId,
          },
          select: {
            buyerTier: true,
          },
        }),
        prisma.vipUpgradeRequest.findFirst({
          where: {
            companyId: buyerContext.companyId,
          },
          orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
          select: {
            status: true,
            requestedAt: true,
          },
        }),
      ]);

      if (!company) {
        await sendUnauthorized(reply);
        return;
      }

      await reply.code(200).send({
        tier: company.buyerTier,
        upgradeRequest: latestRequest
          ? {
              status: latestRequest.status,
              requestedAt: latestRequest.requestedAt.toISOString(),
            }
          : null,
      });
    },
  );
}
