import { describe, expect, it } from "vitest";

import {
  buildVipTeaserCard,
  evaluateVipAccess,
  type VipRequestActorBase,
} from "../vip-early-access";

function createActorBase(
  overrides: Partial<VipRequestActorBase> = {},
): VipRequestActorBase {
  return {
    userId: "user-1",
    companyId: "company-1",
    role: "BUYER",
    buyerContext: {
      userId: "user-1",
      companyId: "company-1",
      userStatus: "ACTIVE",
      companyStatus: "ACTIVE",
      buyerTier: "STANDARD",
    },
    ...overrides,
  };
}

describe("evaluateVipAccess", () => {
  const approvedAt = new Date("2026-03-19T10:15:00.000Z");
  const releaseAt = new Date("2026-03-20T10:15:00.000Z");
  const activeNow = new Date("2026-03-19T18:00:00.000Z");
  const releasedNow = new Date("2026-03-20T10:15:00.000Z");

  it("returns teaser-only access for regular buyers during the active window", () => {
    const decision = evaluateVipAccess({
      actorBase: createActorBase(),
      snapshot: {
        approvedAt,
        vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
        vipReleaseAt: releaseAt,
        sellerCompanyId: "seller-1",
      },
      now: activeNow,
    });

    expect(decision.listingMode).toBe("TEASER");
    expect(decision.canViewDetail).toBe(false);
    expect(decision.canBid).toBe(false);
    expect(decision.canWatchlist).toBe(false);
  });

  it("returns full access for VIP buyers during the active window", () => {
    const decision = evaluateVipAccess({
      actorBase: createActorBase({
        buyerContext: {
          userId: "user-1",
          companyId: "company-1",
          userStatus: "ACTIVE",
          companyStatus: "ACTIVE",
          buyerTier: "VIP",
        },
      }),
      snapshot: {
        approvedAt,
        vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
        vipReleaseAt: releaseAt,
        sellerCompanyId: "seller-1",
      },
      now: activeNow,
    });

    expect(decision.listingMode).toBe("FULL");
    expect(decision.canViewDetail).toBe(true);
    expect(decision.canBid).toBe(true);
    expect(decision.canBuyNow).toBe(true);
    expect(decision.showVipEarlyAccessBadge).toBe(true);
  });

  it("treats anonymous users like regular buyers during the active window", () => {
    const decision = evaluateVipAccess({
      actorBase: createActorBase({
        userId: null,
        companyId: null,
        role: null,
        buyerContext: null,
      }),
      snapshot: {
        approvedAt,
        vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
        vipReleaseAt: releaseAt,
      },
      now: activeNow,
    });

    expect(decision.actorCategory).toBe("anonymous");
    expect(decision.listingMode).toBe("TEASER");
    expect(decision.canViewDetail).toBe(false);
  });

  it("restores normal regular-buyer access at the exact release boundary", () => {
    const decision = evaluateVipAccess({
      actorBase: createActorBase(),
      snapshot: {
        approvedAt,
        vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
        vipReleaseAt: releaseAt,
      },
      now: releasedNow,
    });

    expect(decision.listingMode).toBe("FULL");
    expect(decision.canViewDetail).toBe(true);
    expect(decision.canBid).toBe(true);
    expect(decision.vipAccessActive).toBe(false);
  });

  it("fails closed when restricted policy metadata is incomplete", () => {
    const decision = evaluateVipAccess({
      actorBase: createActorBase(),
      snapshot: {
        approvedAt: null,
        vipAccessPolicy: "UNDETERMINED_RESTRICTED",
        vipReleaseAt: null,
      },
      now: activeNow,
    });

    expect(decision.failClosed).toBe(true);
    expect(decision.listingMode).toBe("TEASER");
    expect(decision.canViewDetail).toBe(false);
  });

  it("preserves full seller-owner access to internal surfaces", () => {
    const decision = evaluateVipAccess({
      actorBase: createActorBase({
        role: "SELLER",
        companyId: "seller-1",
        buyerContext: null,
      }),
      snapshot: {
        approvedAt,
        vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
        vipReleaseAt: releaseAt,
        sellerCompanyId: "seller-1",
      },
      now: activeNow,
    });

    expect(decision.actorCategory).toBe("seller_authenticated");
    expect(decision.listingMode).toBe("FULL");
    expect(decision.sellerAdminStatusText).toBe("Approved – VIP Early Access");
  });
});

describe("buildVipTeaserCard", () => {
  it("returns the exact teaser contract without leaking raw ids", () => {
    const teaser = buildVipTeaserCard("auction-123");

    expect(teaser).toEqual({
      teaserKey: expect.any(String),
      mode: "VIP_TEASER",
      teaserText: "Early access for VIP buyers",
    });
    expect(teaser.teaserKey).not.toContain("auction-123");
  });
});
