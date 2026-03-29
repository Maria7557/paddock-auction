import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../../db";
import { loadBuyerAccessContext, requireAuth } from "../../lib/auth";
import {
  evaluateVipAccess,
  readTrustedCurrentTime,
  type VipRequestActorBase,
} from "../../lib/vip-early-access";

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
  year: number;
  mileage: number;
  regionSpec: string | null;
  marketPrice: number | null;
  buyNowPrice: number | null;
  imageUrl?: string;
  startsAt: string | null;
  endsAt: string | null;
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

type LiveBidItem = {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  currentHighestBid: number;
  isLeading: boolean;
  auctionEndIso: string;
  auctionStatus: "LIVE" | "EXTENDED";
};

type ScheduledBidItem = {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStartIso: string;
  auctionStatus: "SCHEDULED";
  isLeading: boolean;
};

type WonPendingItem = {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStatus: "AWAITING_SELLER_DECISION";
  sellerDecisionDeadlineIso: string;
};

type WonInvoiceItem = {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStatus: "PAYMENT_PENDING";
  invoiceId: string | null;
  invoiceDueAt: string | null;
};

type EndedBidItem = {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStatus: string;
  isLeading: boolean;
};

type BuyerMyBidsResponse = {
  live: LiveBidItem[];
  scheduled: ScheduledBidItem[];
  wonPending: WonPendingItem[];
  wonInvoice: WonInvoiceItem[];
  ended: EndedBidItem[];
};

type BuyerBuyingPowerResponse = {
  depositAmount: string;
  ceiling: string;
  activeBidsTotal: string;
  remaining: string;
  activeBids: Array<{
    auctionId: string;
    lotTitle: string;
    amount: string;
  }>;
};

const MINIMUM_REQUIRED_DEPOSIT_AED = 5_000;
const DEFAULT_BUYING_POWER_CEILING_AED = 300_000;

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

async function toOptionalNumberValue(value: DecimalLike | null | undefined): Promise<number | null> {
  if (value == null) {
    return null;
  }

  try {
    return await toNumberValue(value);
  } catch {
    return null;
  }
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

async function sendForbidden(reply: FastifyReply): Promise<void> {
  await reply.code(403).send({
    error: "Forbidden",
  });
}

async function toMoneyString(value: DecimalLike): Promise<string> {
  return (await toNumberValue(value)).toFixed(2);
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
  buyerTier: "STANDARD" | "VIP";
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

function normalizeStatusValue(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function calculateBuyingPowerCeilingAed(depositAmountAed: number): number {
  if (depositAmountAed < MINIMUM_REQUIRED_DEPOSIT_AED) {
    return 0;
  }

  return Number(
    (
      (depositAmountAed / MINIMUM_REQUIRED_DEPOSIT_AED) *
      DEFAULT_BUYING_POWER_CEILING_AED
    ).toFixed(2),
  );
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
      estimatedValue?: DecimalLike | null;
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
): Promise<LotSummary> {
  const company = companyById.get(auction.sellerCompanyId);

  return {
    id: auction.id,
    state: auction.state,
    currentPrice: await toNumberValue(auction.currentPrice),
    minIncrement: await toNumberValue(auction.minIncrement),
    startingPrice: await toNumberValue(auction.startingPrice),
    buyNowPrice: auction.buyNowPrice === null ? null : await toNumberValue(auction.buyNowPrice),
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
      marketPrice: await toOptionalNumberValue(auction.vehicle.estimatedValue),
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

function createBuyerActorBase(input: {
  userId: string;
  companyId: string;
  userStatus: string;
  companyStatus: string;
  kycVerified: boolean;
  buyerTier: "STANDARD" | "VIP";
}): VipRequestActorBase {
  return {
    userId: input.userId,
    companyId: input.companyId,
    role: "BUYER",
    buyerContext: {
      userId: input.userId,
      companyId: input.companyId,
      userStatus: input.userStatus,
      companyStatus: input.companyStatus,
      kycVerified: input.kycVerified,
      buyerTier: input.buyerTier,
    },
  };
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

      const actorBase = createBuyerActorBase(buyerContext);
      const now = await readTrustedCurrentTime(prisma);

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
            auction: {
              select: {
                sellerCompanyId: true,
                approvedAt: true,
                vipAccessPolicy: true,
                vipReleaseAt: true,
              },
            },
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
                sellerCompanyId: true,
                approvedAt: true,
                vipAccessPolicy: true,
                vipReleaseAt: true,
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
                id: true,
                sellerCompanyId: true,
                approvedAt: true,
                vipAccessPolicy: true,
                vipReleaseAt: true,
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

      const bidAccessByAuction = new Map(
        bids.map((bid) => [
          bid.auctionId,
          {
            approvedAt: bid.auction.approvedAt,
            vipAccessPolicy: bid.auction.vipAccessPolicy,
            vipReleaseAt: bid.auction.vipReleaseAt,
            sellerCompanyId: bid.auction.sellerCompanyId,
          },
        ]),
      );

      const bidActivities: DashboardActivity[] = [];
      const visibleActiveBidAuctions = activeBidAuctions.filter((entry) =>
        evaluateVipAccess({
          actorBase,
          snapshot: {
            approvedAt: entry.auction.approvedAt,
            vipAccessPolicy: entry.auction.vipAccessPolicy,
            vipReleaseAt: entry.auction.vipReleaseAt,
            sellerCompanyId: entry.auction.sellerCompanyId,
          },
          now,
        }).canViewDetail,
      );

      for (const auctionSummary of bidsByAuction.values()) {
        const bidAccess = bidAccessByAuction.get(auctionSummary.auctionId);
        const accessDecision = evaluateVipAccess({
          actorBase,
          snapshot: {
            approvedAt: bidAccess?.approvedAt,
            vipAccessPolicy: bidAccess?.vipAccessPolicy,
            vipReleaseAt: bidAccess?.vipReleaseAt,
            sellerCompanyId: bidAccess?.sellerCompanyId,
          },
          now,
        });

        if (!accessDecision.canViewDetail) {
          continue;
        }

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

      const visibleSavedLots = savedLots.filter((savedLot) =>
        evaluateVipAccess({
          actorBase,
          snapshot: {
            approvedAt: savedLot.auction.approvedAt,
            vipAccessPolicy: savedLot.auction.vipAccessPolicy,
            vipReleaseAt: savedLot.auction.vipReleaseAt,
            sellerCompanyId: savedLot.auction.sellerCompanyId,
          },
          now,
        }).canViewDetail,
      );
      const watchedActivities: DashboardActivity[] = visibleSavedLots.map((savedLot) => {
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
      const minDepositAed = Number(process.env.MIN_DEPOSIT_AED ?? 5000);
      const hasRequiredDeposit = balanceAed >= minDepositAed;
      const isVerified =
        buyerContext.kycVerified === true &&
        normalizeStatusValue(buyerContext.userStatus) === "ACTIVE" &&
        normalizeStatusValue(buyerContext.companyStatus) === "ACTIVE";
      const hasActivity =
        visibleActiveBidAuctions.length > 0 ||
        bidActivities.length > 0 ||
        visibleSavedLots.length > 0 ||
        recentIssuedInvoices.length > 0;
      const savedAuctionIds = new Set(visibleSavedLots.map((entry) => entry.auctionId));

      let onboardingStep: 1 | 2 | 3 | 4 = 1;

      if (isVerified && !hasRequiredDeposit) {
        onboardingStep = 2;
      }

      if (isVerified && hasRequiredDeposit) {
        onboardingStep = hasActivity ? 4 : 3;
      }

      let recommendedLots: RecommendedLot[] = [];

      if (visibleActiveBidAuctions.length === 0) {
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

        const serializedLots = (
          await Promise.all(
            auctions.map(async (auction) => {
              const accessDecision = evaluateVipAccess({
                actorBase,
                snapshot: {
                  approvedAt: auction.approvedAt,
                  vipAccessPolicy: auction.vipAccessPolicy,
                  vipReleaseAt: auction.vipReleaseAt,
                  sellerCompanyId: auction.sellerCompanyId,
                },
                now,
              });

              if (accessDecision.listingMode !== "FULL") {
                return null;
              }

              return serializeLotSummary(auction, companyLookup, savedAuctionIds.has(auction.id));
            }),
          )
        ).filter((lot): lot is LotSummary => lot !== null);

        recommendedLots = serializedLots.map((lot) => ({
          id: lot.id,
          title: buildLotTitle(lot.vehicle.brand, lot.vehicle.model, lot.id),
          currentBid: lot.currentPrice,
          status: lot.state,
          year: lot.vehicle.year,
          mileage: lot.vehicle.mileage,
          regionSpec: lot.vehicle.regionSpec,
          marketPrice: lot.vehicle.marketPrice,
          buyNowPrice: lot.buyNowPrice,
          imageUrl: lot.vehicle.images[0],
          startsAt: lot.startsAt,
          endsAt: lot.endsAt,
        }));
      }

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

      const responseBody: BuyerDashboardResponse = {
        metrics: {
          activeBids: visibleActiveBidAuctions.length,
          watching: visibleSavedLots.length,
          watchlistCount: visibleSavedLots.length,
          invoicesDue,
          depositBalance: availableBalanceAed,
          depositLocked: lockedBalanceAed,
          depositBalanceAed: balanceAed,
        },
        depositStatus: {
          requiredAmountAed: minDepositAed,
          balanceAed,
          lockedBalanceAed,
          availableBalanceAed,
          hasRequiredDeposit,
        },
        onboardingStep,
        recentActivity,
        recommendedLots,
        vipStatus: {
          tier: buyerCompany?.buyerTier === "VIP" ? "VIP" : "STANDARD",
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
    "/buyer/buying-power",
    async function buyerBuyingPowerHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      if (reply.sent) {
        return;
      }

      if (request.auth?.role !== "BUYER") {
        await sendForbidden(reply);
        return;
      }

      const buyerContext = await requireBuyerContext(request, reply);

      if (!buyerContext) {
        return;
      }

      const [activeLock, depositWallet, legacyWallet, summary, companyHighestBids] = await Promise.all([
        prisma.depositLock.findFirst({
          where: {
            companyId: buyerContext.companyId,
            status: "ACTIVE",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            amount: true,
            buyingPowerCeiling: true,
          },
        }),
        prisma.depositWallet.findUnique({
          where: {
            companyId_currency: {
              companyId: buyerContext.companyId,
              currency: "AED",
            },
          },
          select: {
            availableBalance: true,
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
        prisma.buyerBidSummary.findUnique({
          where: {
            companyId: buyerContext.companyId,
          },
          select: {
            activeBidsTotal: true,
          },
        }),
        prisma.bid.findMany({
          where: {
            companyId: buyerContext.companyId,
            auction: {
              highestBidId: {
                not: null,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            auctionId: true,
            amount: true,
            auction: {
              select: {
                highestBidId: true,
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
      ]);

      const depositWalletAvailableAed = depositWallet
        ? await toNumberValue(depositWallet.availableBalance)
        : 0;
      const legacyWalletAvailableAed = legacyWallet
        ? Math.max(
            0,
            Number(
              (
                (await toNumberValue(legacyWallet.balance)) -
                (await toNumberValue(legacyWallet.lockedBalance))
              ).toFixed(2),
            ),
          )
        : 0;

      const depositAmount = activeLock
        ? await toNumberValue(activeLock.amount)
        : depositWallet
          ? depositWalletAvailableAed
          : legacyWalletAvailableAed;
      const ceiling = activeLock
        ? await toNumberValue(activeLock.buyingPowerCeiling)
        : calculateBuyingPowerCeilingAed(depositAmount);

      if (depositAmount < MINIMUM_REQUIRED_DEPOSIT_AED || ceiling <= 0) {
        await reply.code(200).send({
          depositAmount: "0.00",
          ceiling: "0.00",
          activeBidsTotal: "0.00",
          remaining: "0.00",
          activeBids: [],
        } satisfies BuyerBuyingPowerResponse);
        return;
      }

      const activeBidsTotal = summary ? await toNumberValue(summary.activeBidsTotal) : 0;
      const remaining = Math.max(0, Number((ceiling - activeBidsTotal).toFixed(2)));
      const activeBids = await Promise.all(
        companyHighestBids
          .filter((bid) => bid.auction.highestBidId === bid.id)
          .map(async (bid) => ({
            auctionId: bid.auctionId,
            lotTitle: buildLotTitle(
              bid.auction.vehicle?.brand,
              bid.auction.vehicle?.model,
              bid.auctionId,
            ),
            amount: await toMoneyString(bid.amount),
          })),
      );

      await reply.code(200).send({
        depositAmount: depositAmount.toFixed(2),
        ceiling: ceiling.toFixed(2),
        activeBidsTotal: activeBidsTotal.toFixed(2),
        remaining: remaining.toFixed(2),
        activeBids,
      } satisfies BuyerBuyingPowerResponse);
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

      const actorBase = createBuyerActorBase(buyerContext);
      const now = await readTrustedCurrentTime(prisma);

      const bids = await prisma.bid.findMany({
        where: {
          companyId: buyerContext.companyId,
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
              winnerCompanyId: true,
              decisionDeadlineAt: true,
              sellerCompanyId: true,
              approvedAt: true,
              vipAccessPolicy: true,
              vipReleaseAt: true,
              startsAt: true,
              endsAt: true,
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                  images: true,
                },
              },
            },
          },
        },
      });

      if (bids.length === 0) {
        const emptyResponse: BuyerMyBidsResponse = {
          live: [],
          scheduled: [],
          wonPending: [],
          wonInvoice: [],
          ended: [],
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
          imageUrl: string | null;
          highestBidId: string | null;
          currentHighestBid: number;
          myBidAmount: number;
          winnerCompanyId: string | null;
          decisionDeadlineAt: Date | string | null;
          startsAt: Date | string;
          endsAt: Date | string;
          bidIds: Set<string>;
        }
      >();

      for (const bid of bids) {
        const accessDecision = evaluateVipAccess({
          actorBase,
          snapshot: {
            approvedAt: bid.auction.approvedAt,
            vipAccessPolicy: bid.auction.vipAccessPolicy,
            vipReleaseAt: bid.auction.vipReleaseAt,
            sellerCompanyId: bid.auction.sellerCompanyId,
          },
          now,
        });

        if (!accessDecision.canViewDetail) {
          continue;
        }

        const bidAmount = await toNumberValue(bid.amount);
        const currentBid = await toNumberValue(bid.auction.currentPrice);
        const lotTitle = buildLotTitle(
          bid.auction.vehicle?.brand,
          bid.auction.vehicle?.model,
          bid.auction.id,
        );
        const imageUrl = bid.auction.vehicle?.images?.[0] ?? null;
        const existing = groupedBids.get(bid.auctionId);

        if (!existing) {
          groupedBids.set(bid.auctionId, {
            auctionId: bid.auctionId,
            lotTitle,
            imageUrl,
            state: bid.auction.state,
            highestBidId: bid.auction.highestBidId,
            currentHighestBid: currentBid,
            myBidAmount: bidAmount,
            winnerCompanyId: bid.auction.winnerCompanyId,
            decisionDeadlineAt: bid.auction.decisionDeadlineAt,
            startsAt: bid.auction.startsAt,
            endsAt: bid.auction.endsAt,
            bidIds: new Set([bid.id]),
          });
          continue;
        }

        existing.myBidAmount = Math.max(existing.myBidAmount, bidAmount);
        existing.currentHighestBid = currentBid;
        existing.state = bid.auction.state;
        existing.highestBidId = bid.auction.highestBidId;
        existing.winnerCompanyId = bid.auction.winnerCompanyId;
        existing.decisionDeadlineAt = bid.auction.decisionDeadlineAt;
        existing.imageUrl = existing.imageUrl ?? imageUrl;
        existing.bidIds.add(bid.id);
      }

      const winnerAuctionIds = new Set(
        Array.from(groupedBids.values())
          .filter((entry) => entry.winnerCompanyId === buyerContext.companyId)
          .map((entry) => entry.auctionId),
      );

      const invoiceByAuctionId = new Map<
        string,
        {
          id: string | null;
          dueAt: Date | null;
        }
      >();

      await Promise.all(
        Array.from(groupedBids.values())
          .filter((entry) => {
            const auctionStatus = normalizeStatusValue(entry.state);

            return auctionStatus === "PAYMENT_PENDING" && winnerAuctionIds.has(entry.auctionId);
          })
          .map(async (entry) => {
            const invoice = await prisma.invoice.findFirst({
              where: {
                auctionId: entry.auctionId,
                buyerCompanyId: buyerContext.companyId,
              },
              select: {
                id: true,
                dueAt: true,
              },
            });

            invoiceByAuctionId.set(entry.auctionId, {
              id: invoice?.id ?? null,
              dueAt: invoice?.dueAt ?? null,
            });
          }),
      );

      const endedAuctionStates = new Set(["RELISTED", "DEFAULTED", "CANCELED"]);

      const liveEntries: Array<{ sortValue: string; item: LiveBidItem }> = [];
      const scheduledEntries: Array<{ sortValue: string; item: ScheduledBidItem }> = [];
      const wonPendingEntries: Array<{ sortValue: string; item: WonPendingItem }> = [];
      const wonInvoiceEntries: Array<{ sortValue: string; item: WonInvoiceItem }> = [];
      const endedEntries: Array<{ sortValue: string; item: EndedBidItem }> = [];

      for (const entry of groupedBids.values()) {
        const auctionStatus = normalizeStatusValue(entry.state);
        const isLeading =
          entry.highestBidId !== null && entry.bidIds.has(entry.highestBidId);
        const isWinner = winnerAuctionIds.has(entry.auctionId);

        if (
          auctionStatus === "AWAITING_SELLER_DECISION" &&
          isWinner
        ) {
          const sellerDecisionDeadlineIso = await toIsoString(entry.decisionDeadlineAt);

          if (!sellerDecisionDeadlineIso) {
            continue;
          }

          wonPendingEntries.push({
            sortValue: sellerDecisionDeadlineIso,
            item: {
              auctionId: entry.auctionId,
              lotTitle: entry.lotTitle,
              imageUrl: entry.imageUrl,
              myBidAmount: entry.myBidAmount,
              auctionStatus: "AWAITING_SELLER_DECISION",
              sellerDecisionDeadlineIso,
            },
          });
          continue;
        }

        if (
          auctionStatus === "PAYMENT_PENDING" &&
          isWinner
        ) {
          const invoiceRecord = invoiceByAuctionId.get(entry.auctionId);
          const invoiceDueAt = await toIsoString(invoiceRecord?.dueAt ?? null);
          const sortValue = invoiceDueAt ?? (await toIsoString(entry.endsAt)) ?? "";

          wonInvoiceEntries.push({
            sortValue,
            item: {
              auctionId: entry.auctionId,
              lotTitle: entry.lotTitle,
              imageUrl: entry.imageUrl,
              myBidAmount: entry.myBidAmount,
              auctionStatus: "PAYMENT_PENDING",
              invoiceId: invoiceRecord?.id ?? null,
              invoiceDueAt,
            },
          });
          continue;
        }

        if (auctionStatus === "SCHEDULED") {
          const auctionStartIso = await toIsoString(entry.startsAt);

          if (!auctionStartIso) {
            continue;
          }

          scheduledEntries.push({
            sortValue: auctionStartIso,
            item: {
              auctionId: entry.auctionId,
              lotTitle: entry.lotTitle,
              imageUrl: entry.imageUrl,
              myBidAmount: entry.myBidAmount,
              auctionStartIso,
              auctionStatus: "SCHEDULED",
              isLeading,
            },
          });
          continue;
        }

        if (auctionStatus === "LIVE" || auctionStatus === "EXTENDED") {
          const auctionEndIso = await toIsoString(entry.endsAt);

          if (!auctionEndIso) {
            continue;
          }

          liveEntries.push({
            sortValue: auctionEndIso,
            item: {
              auctionId: entry.auctionId,
              lotTitle: entry.lotTitle,
              imageUrl: entry.imageUrl,
              myBidAmount: entry.myBidAmount,
              currentHighestBid: entry.currentHighestBid,
              isLeading,
              auctionEndIso,
              auctionStatus,
            },
          });
          continue;
        }

        if (!endedAuctionStates.has(auctionStatus)) {
          continue;
        }

        if (!isWinner) {
          continue;
        }

        const endedSortIso = await toIsoString(entry.endsAt);

        if (!endedSortIso) {
          continue;
        }

        endedEntries.push({
          sortValue: endedSortIso,
          item: {
            auctionId: entry.auctionId,
            lotTitle: entry.lotTitle,
            imageUrl: entry.imageUrl,
            myBidAmount: entry.myBidAmount,
            auctionStatus,
            isLeading,
          },
        });
      }

      const responseBody: BuyerMyBidsResponse = {
        live: liveEntries
          .sort((left, right) => left.sortValue.localeCompare(right.sortValue))
          .map((entry) => entry.item),
        scheduled: scheduledEntries
          .sort((left, right) => left.sortValue.localeCompare(right.sortValue))
          .map((entry) => entry.item),
        wonPending: wonPendingEntries
          .sort((left, right) => left.sortValue.localeCompare(right.sortValue))
          .map((entry) => entry.item),
        wonInvoice: wonInvoiceEntries
          .sort((left, right) => left.sortValue.localeCompare(right.sortValue))
          .map((entry) => entry.item),
        ended: endedEntries
          .sort((left, right) => right.sortValue.localeCompare(left.sortValue))
          .map((entry) => entry.item),
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

      const actorBase = createBuyerActorBase(buyerContext);
      const now = await readTrustedCurrentTime(prisma);

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

      const lotSummaries = (
        await Promise.all(
          savedLots.map(async (savedLot) => {
            const accessDecision = evaluateVipAccess({
              actorBase,
              snapshot: {
                approvedAt: savedLot.auction.approvedAt,
                vipAccessPolicy: savedLot.auction.vipAccessPolicy,
                vipReleaseAt: savedLot.auction.vipReleaseAt,
                sellerCompanyId: savedLot.auction.sellerCompanyId,
              },
              now,
            });

            if (accessDecision.listingMode !== "FULL") {
              return null;
            }

            return serializeLotSummary(savedLot.auction, companyLookup, true);
          }),
        )
      ).filter((lot): lot is LotSummary => lot !== null);
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
      const actorBase = createBuyerActorBase(buyerContext);
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
          sellerCompanyId: true,
          approvedAt: true,
          vipAccessPolicy: true,
          vipReleaseAt: true,
        },
      });

      if (!auction) {
        await reply.code(404).send({
          error: "LOT_NOT_FOUND",
        });
        return;
      }

      const accessDecision = evaluateVipAccess({
        actorBase,
        snapshot: {
          approvedAt: auction.approvedAt,
          vipAccessPolicy: auction.vipAccessPolicy,
          vipReleaseAt: auction.vipReleaseAt,
          sellerCompanyId: auction.sellerCompanyId,
        },
        now: await readTrustedCurrentTime(prisma),
      });

      if (!accessDecision.canWatchlist) {
        await reply.code(403).send({
          error: "LOT_UNAVAILABLE",
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
    "/buyer/upgrade-to-vip",
    async function buyerUpgradeToVipHandler(
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

      const now = new Date();
      const company = await prisma.company.findUnique({
        where: {
          id: buyerContext.companyId,
        },
        select: {
          id: true,
          buyerTier: true,
        },
      });

      if (!company) {
        await sendUnauthorized(reply);
        return;
      }

      const latestApprovedRequest = await prisma.vipUpgradeRequest.findFirst({
        where: {
          companyId: buyerContext.companyId,
          status: "APPROVED",
        },
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        select: {
          requestedAt: true,
        },
      });

      if (company.buyerTier === "VIP") {
        const activatedAt = latestApprovedRequest?.requestedAt ?? now;
        const expiresAt = new Date(activatedAt);
        expiresAt.setDate(expiresAt.getDate() + 30);

        await reply.code(200).send({
          status: "APPROVED" as const,
          activatedAt: activatedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        });
        return;
      }

      const createdRequest = await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: {
            id: buyerContext.companyId,
          },
          data: {
            buyerTier: "VIP",
          },
        });

        return tx.vipUpgradeRequest.create({
          data: {
            id: randomUUID(),
            companyId: buyerContext.companyId,
            status: "APPROVED",
            requestedAt: now,
          },
          select: {
            requestedAt: true,
          },
        });
      });

      const expiresAt = new Date(createdRequest.requestedAt);
      expiresAt.setDate(expiresAt.getDate() + 30);

      await reply.code(200).send({
        status: "APPROVED" as const,
        activatedAt: createdRequest.requestedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
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
