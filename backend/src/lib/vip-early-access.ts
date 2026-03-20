import { createHash } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { loadBuyerAccessContext, type BuyerAccessContext } from "./auth";

export type VipAccessPolicyValue =
  | "NONE"
  | "VIP_EARLY_ACCESS_24H"
  | "UNDETERMINED_RESTRICTED";

export type VipListingMode = "FULL" | "TEASER" | "HIDDEN";

export type VipActorCategory =
  | "admin"
  | "seller_authenticated"
  | "vip_buyer"
  | "regular_buyer"
  | "anonymous";

export type VipRequestActorBase = {
  userId: string | null;
  companyId: string | null;
  role: string | null;
  buyerContext: BuyerAccessContext | null;
};

export type VipAccessSnapshot = {
  approvedAt?: Date | string | null;
  vipAccessPolicy?: string | null;
  vipReleaseAt?: Date | string | null;
  sellerCompanyId?: string | null;
};

export type VipAccessDecision = {
  actorCategory: VipActorCategory;
  vipAccessActive: boolean;
  failClosed: boolean;
  listingMode: VipListingMode;
  canViewDetail: boolean;
  canViewBidHistory: boolean;
  canViewRealtime: boolean;
  canBid: boolean;
  canBuyNow: boolean;
  canWatchlist: boolean;
  searchable: boolean;
  shareEnabled: boolean;
  showVipEarlyAccessBadge: boolean;
  sellerAdminStatusText: "Approved" | "Approved – VIP Early Access";
};

type CurrentTimeRow = {
  currentTime: Date | string;
};

type CurrentTimeReader = {
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
};

export type VipTeaserCard = {
  teaserKey: string;
  mode: "VIP_TEASER";
  teaserText: "Early access for VIP buyers";
};

const ACTIVE_INTERNAL_STATUS_TEXT = "Approved – VIP Early Access" as const;
const DEFAULT_INTERNAL_STATUS_TEXT = "Approved" as const;
const VIP_TEASER_TEXT = "Early access for VIP buyers" as const;

function normalizeRole(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";

  return normalized.length > 0 ? normalized : null;
}

function normalizePolicy(
  value: string | null | undefined,
): VipAccessPolicyValue {
  if (value === "VIP_EARLY_ACCESS_24H") {
    return value;
  }

  if (value === "UNDETERMINED_RESTRICTED") {
    return value;
  }

  return "NONE";
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isRestrictedPolicy(value: VipAccessPolicyValue): boolean {
  return value === "VIP_EARLY_ACCESS_24H" || value === "UNDETERMINED_RESTRICTED";
}

function hasRestrictedWindowExpired(
  releaseAt: Date | null,
  now: Date,
): boolean {
  if (!releaseAt) {
    return false;
  }

  return now.getTime() >= releaseAt.getTime();
}

function isRestrictedWindowActive(
  approvedAt: Date | null,
  releaseAt: Date | null,
  now: Date,
): boolean {
  if (!approvedAt || !releaseAt) {
    return false;
  }

  return now.getTime() >= approvedAt.getTime() && now.getTime() < releaseAt.getTime();
}

function resolveTestFallbackCurrentTime(): Date {
  if (process.env.NODE_ENV === "test") {
    return new Date();
  }

  throw new Error("Unable to read trusted current time");
}

export async function readTrustedCurrentTime(
  db: Partial<CurrentTimeReader>,
): Promise<Date> {
  if (!db || typeof db.$queryRaw !== "function") {
    return resolveTestFallbackCurrentTime();
  }

  try {
    const rows = await db.$queryRaw<CurrentTimeRow[]>`
      SELECT CURRENT_TIMESTAMP AS "currentTime"
    `;
    const currentTime = toDateOrNull(rows[0]?.currentTime);

    if (!currentTime) {
      return resolveTestFallbackCurrentTime();
    }

    return currentTime;
  } catch {
    return resolveTestFallbackCurrentTime();
  }
}

export async function loadVipRequestActorBase(
  request: FastifyRequest,
): Promise<VipRequestActorBase> {
  const role = normalizeRole(request.auth?.role);
  const userId = request.auth?.userId?.trim() || null;
  const companyId = request.auth?.companyId?.trim() || null;

  if (role !== "BUYER") {
    return {
      userId,
      companyId,
      role,
      buyerContext: null,
    };
  }

  return {
    userId,
    companyId,
    role,
    buyerContext: await (async () => {
      try {
        return await loadBuyerAccessContext(request);
      } catch {
        return null;
      }
    })(),
  };
}

export function resolveVipActorCategory(
  actorBase: VipRequestActorBase,
  sellerCompanyId?: string | null,
): VipActorCategory {
  if (actorBase.role === "ADMIN" || actorBase.role === "SUPER_ADMIN") {
    return "admin";
  }

  if (
    actorBase.role === "SELLER" &&
    actorBase.companyId &&
    sellerCompanyId &&
    actorBase.companyId === sellerCompanyId
  ) {
    return "seller_authenticated";
  }

  if (actorBase.role === "BUYER") {
    return actorBase.buyerContext?.buyerTier === "VIP" ? "vip_buyer" : "regular_buyer";
  }

  return "anonymous";
}

export function evaluateVipAccess(
  input: {
    actorBase: VipRequestActorBase;
    snapshot: VipAccessSnapshot;
    now: Date;
  },
): VipAccessDecision {
  const policy = normalizePolicy(input.snapshot.vipAccessPolicy);
  const approvedAt = toDateOrNull(input.snapshot.approvedAt);
  const releaseAt = toDateOrNull(input.snapshot.vipReleaseAt);
  const actorCategory = resolveVipActorCategory(
    input.actorBase,
    input.snapshot.sellerCompanyId,
  );
  const restrictedPolicy = isRestrictedPolicy(policy);
  const windowExpired = hasRestrictedWindowExpired(releaseAt, input.now);
  const vipAccessActive = restrictedPolicy
    ? isRestrictedWindowActive(approvedAt, releaseAt, input.now)
    : false;
  const failClosed =
    restrictedPolicy && !windowExpired && (!approvedAt || !releaseAt || vipAccessActive);
  const sellerAdminStatusText =
    restrictedPolicy && !windowExpired && (!approvedAt || !releaseAt || vipAccessActive)
      ? ACTIVE_INTERNAL_STATUS_TEXT
      : DEFAULT_INTERNAL_STATUS_TEXT;

  if (actorCategory === "admin" || actorCategory === "seller_authenticated") {
    return {
      actorCategory,
      vipAccessActive,
      failClosed,
      listingMode: "FULL",
      canViewDetail: true,
      canViewBidHistory: true,
      canViewRealtime: true,
      canBid: false,
      canBuyNow: false,
      canWatchlist: false,
      searchable: true,
      shareEnabled: true,
      showVipEarlyAccessBadge: restrictedPolicy && !windowExpired && vipAccessActive,
      sellerAdminStatusText,
    };
  }

  if (actorCategory === "vip_buyer") {
    return {
      actorCategory,
      vipAccessActive,
      failClosed,
      listingMode: "FULL",
      canViewDetail: true,
      canViewBidHistory: true,
      canViewRealtime: true,
      canBid: true,
      canBuyNow: true,
      canWatchlist: true,
      searchable: true,
      shareEnabled: !(restrictedPolicy && !windowExpired && vipAccessActive),
      showVipEarlyAccessBadge: restrictedPolicy && !windowExpired && vipAccessActive,
      sellerAdminStatusText,
    };
  }

  if (failClosed) {
    return {
      actorCategory,
      vipAccessActive,
      failClosed,
      listingMode: "TEASER",
      canViewDetail: false,
      canViewBidHistory: false,
      canViewRealtime: false,
      canBid: false,
      canBuyNow: false,
      canWatchlist: false,
      searchable: false,
      shareEnabled: false,
      showVipEarlyAccessBadge: false,
      sellerAdminStatusText,
    };
  }

  return {
    actorCategory,
    vipAccessActive,
    failClosed,
    listingMode: "FULL",
    canViewDetail: true,
    canViewBidHistory: true,
    canViewRealtime: true,
    canBid: actorCategory !== "anonymous",
    canBuyNow: actorCategory !== "anonymous",
    canWatchlist: actorCategory !== "anonymous",
    searchable: true,
    shareEnabled: true,
    showVipEarlyAccessBadge: false,
    sellerAdminStatusText,
  };
}

export function buildVipTeaserCard(sourceKey: string): VipTeaserCard {
  const teaserKey = createHash("sha256")
    .update(sourceKey)
    .digest("hex")
    .slice(0, 16);

  return {
    teaserKey,
    mode: "VIP_TEASER",
    teaserText: VIP_TEASER_TEXT,
  };
}
