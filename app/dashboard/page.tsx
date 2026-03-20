import Link from "next/link";

import { RecommendedLots } from "@/components/buyer/RecommendedLots";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { TierStatusCard } from "@/components/buyer/TierStatusCard";
import { IconCheck } from "@/components/ui/icons";
import { withLocalePath } from "@/src/i18n/routing";
import { api } from "@/src/lib/api-client";
import { isLiveAuctionState, isScheduledAuctionState } from "@/src/lib/auction-display";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";
import { withServerCookies } from "@/src/lib/server-api-options";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type BuyerDashboardResponse = {
  metrics: {
    activeBids: number;
    watching: number;
    invoicesDue: number;
    depositBalance: number;
    depositLocked: number;
    depositBalanceAed?: number;
  };
  depositStatus: {
    requiredAmountAed: number;
    balanceAed: number;
    lockedBalanceAed: number;
    availableBalanceAed: number;
    hasRequiredDeposit: boolean;
  };
  onboardingStep: 1 | 2 | 3 | 4;
  recentActivity: Array<{
    type: "winning" | "outbid" | "watched";
    lotTitle: string;
    amount?: number;
    timeAgo: string;
  }>;
  recommendedLots: Array<{
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
  }>;
  vipStatus: {
    tier: "STANDARD" | "VIP";
    upgradeRequest: { status: string; requestedAt: string } | null;
  };
};

type BuyerAuthResponse = {
  user?: {
    email?: string;
  };
};

type AuctionsListResponse = {
  auctions?: Array<{
    id?: string;
    state?: string;
    endsAt?: string | null;
    startsAt?: string | null;
    currentPrice?: number;
    totalBids?: number;
    vehicle?: {
      brand?: string;
      model?: string;
      year?: number;
    };
  }>;
  lots?: Array<{
    id?: string;
    state?: string;
    endsAt?: string | null;
    startsAt?: string | null;
    currentPrice?: number;
    totalBids?: number;
    vehicle?: {
      brand?: string;
      model?: string;
      year?: number;
    };
  }>;
};

type DashboardAuction = NonNullable<AuctionsListResponse["auctions"]>[number];

type CapabilitiesRow = {
  feature: string;
  standard: "yes" | "no";
  vip: "yes" | "no";
};

const CAPABILITIES: CapabilitiesRow[] = [
  { feature: "Join auctions", standard: "yes", vip: "yes" },
  { feature: "Pre-bids", standard: "yes", vip: "yes" },
  { feature: "Buy before auction", standard: "no", vip: "yes" },
  { feature: "24h early lot access", standard: "no", vip: "yes" },
];

function normalizeAuctionState(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function getTimeValue(value: string | null | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAuctionTitle(auction: DashboardAuction): string {
  const year = Number(auction.vehicle?.year ?? 0);
  const brand = String(auction.vehicle?.brand ?? "").trim();
  const model = String(auction.vehicle?.model ?? "").trim();

  return `${year > 0 ? `${year} ` : ""}${brand} ${model}`.trim() || `Lot ${String(auction.id ?? "").slice(0, 8).toUpperCase()}`;
}

function pickFeaturedLiveAuction(
  auctions: DashboardAuction[],
): { auction: DashboardAuction; mode: "live" | "scheduled" } | null {
  const liveAuctions = auctions
    .filter((auction) => isLiveAuctionState(auction.state))
    .sort((left, right) => getTimeValue(left.endsAt, Number.MAX_SAFE_INTEGER) - getTimeValue(right.endsAt, Number.MAX_SAFE_INTEGER));

  if (liveAuctions[0]) {
    return {
      auction: liveAuctions[0],
      mode: "live",
    };
  }

  const scheduledAuctions = auctions
    .filter((auction) => isScheduledAuctionState(auction.state))
    .sort((left, right) => getTimeValue(left.startsAt, Number.MAX_SAFE_INTEGER) - getTimeValue(right.startsAt, Number.MAX_SAFE_INTEGER));

  if (scheduledAuctions[0]) {
    return {
      auction: scheduledAuctions[0],
      mode: "scheduled",
    };
  }

  return null;
}

function countAuctionState(
  auctions: Array<{ state?: string; endsAt?: string | null }>,
): {
  live: number;
  endingSoon: number;
  earlyAccess: number;
} {
  const now = Date.now();
  const next24Hours = now + 24 * 60 * 60 * 1000;

  return auctions.reduce(
    (summary, auction) => {
      const state = normalizeAuctionState(auction.state);

      if (state === "LIVE" || state === "EXTENDED") {
        summary.live += 1;

        const endAt = auction.endsAt ? new Date(auction.endsAt).getTime() : null;

        if (endAt && endAt <= next24Hours) {
          summary.endingSoon += 1;
        }
      }

      if (state === "SCHEDULED") {
        summary.earlyAccess += 1;
      }

      return summary;
    },
    { live: 0, endingSoon: 0, earlyAccess: 0 },
  );
}


export default async function DashboardPage() {
  const session = await requireBuyerSession("/dashboard");
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [dashboard, authResponse, auctionsResponse, display] = await Promise.all([
    api.buyer.dashboard<BuyerDashboardResponse>(requestOptions),
    api.auth.me<BuyerAuthResponse>(requestOptions),
    api.auctions.list<AuctionsListResponse>(undefined, requestOptions),
    getPublicDisplaySettings(),
  ]);

  const companyEmail = authResponse.user?.email?.trim() || "buyer@fleetbid.ae";
  const companyName = session.companyName?.trim() || "Buyer company";
  const allAuctions = auctionsResponse.auctions ?? auctionsResponse.lots ?? [];
  const auctionCounts = countAuctionState(allAuctions);
  const hasRequiredDeposit = dashboard.depositStatus.hasRequiredDeposit;
  const tier = dashboard.vipStatus.tier;
  const featuredLiveAuction = pickFeaturedLiveAuction(allAuctions);
  const liveRoomHref = featuredLiveAuction?.auction.id
    ? withLocalePath(`/auctions/live/${featuredLiveAuction.auction.id}`, display.locale)
    : null;
  const featuredAuctionTitle = featuredLiveAuction ? getAuctionTitle(featuredLiveAuction.auction) : null;
  const featuredAuctionStateLabel = featuredLiveAuction?.mode === "live" ? "LIVE" : "UP NEXT";
  const featuredAuctionTimeLabel =
    featuredLiveAuction?.mode === "live"
      ? featuredLiveAuction.auction.endsAt
        ? `Ends ${new Date(featuredLiveAuction.auction.endsAt).toLocaleTimeString("en-AE", {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Bidding open now"
      : featuredLiveAuction?.auction.startsAt
        ? `Starts ${new Date(featuredLiveAuction.auction.startsAt).toLocaleTimeString("en-AE", {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Session opening soon";

  return (
    <BuyerShell
      activePage="dashboard"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={companyName}
      companyEmail={companyEmail}
      tier={tier}
    >
      <div className={styles.page}>
        {featuredLiveAuction && liveRoomHref ? (
          <section className={styles.liveRoomCard}>
            <div className={styles.liveRoomCardBody}>
              <div className={styles.liveRoomCopy}>
                <div className={styles.liveRoomEyebrow}>Live event access</div>
                <h2>
                  {featuredLiveAuction.mode === "live"
                    ? "Current live auction is ready"
                    : "Next live room is ready to preview"}
                </h2>
                <p>
                  {featuredLiveAuction.mode === "live"
                    ? "Open the active bidding room instantly and jump straight into the current live event."
                    : "Open the upcoming live room now to see the lineup, countdown, and be ready before bidding starts."}
                </p>
                <div className={styles.liveRoomMeta}>
                  <span className={`${styles.liveRoomPill} ${featuredLiveAuction.mode === "live" ? styles.liveRoomPillLive : styles.liveRoomPillScheduled}`}>
                    {featuredAuctionStateLabel}
                  </span>
                  <span>{featuredAuctionTitle}</span>
                  <span>{featuredAuctionTimeLabel}</span>
                </div>
              </div>

              <Link
                href={liveRoomHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${styles.liveRoomAction} btn ${featuredLiveAuction.mode === "live" ? "btn-white" : "btn-ghost-white"}`}
              >
                {featuredLiveAuction.mode === "live" ? "Open live room" : "Open coming soon room"}
              </Link>
            </div>
          </section>
        ) : null}

        {tier === "STANDARD" && dashboard.onboardingStep < 3 ? (
          <section className={styles.depositCard}>
            <div className={styles.depositTop} />
            <div className={styles.depositBody}>
              <div className={styles.depositCopy}>
                <div className={styles.sectionHeading}>
                  <h1>Add a deposit to start bidding</h1>
                  <p>
                    A refundable deposit of {formatAed(5000)} is required. Our team reviews it
                    within 12 hours — then you&apos;re ready to bid.
                  </p>
                </div>
                <span className={styles.refundPill}>
                  Fully refundable within 48 hours of your request
                </span>
              </div>

              <div className={styles.depositAmountBlock}>
                <strong>{formatAed(5000)}</strong>
                <span>required deposit</span>
              </div>
            </div>

            <div className={styles.depositSteps}>
              <div className={`${styles.depositStep} ${styles.depositStepActive}`}>
                <span className={styles.depositStepNumber}>1</span>
                <div>
                  <strong>Add deposit</strong>
                  <span>via Wallet</span>
                </div>
              </div>
              <div className={styles.depositStepLine} />
              <div className={styles.depositStep}>
                <span className={styles.depositStepNumber}>2</span>
                <div>
                  <strong>Review</strong>
                  <span>up to 12 hours</span>
                </div>
              </div>
              <div className={styles.depositStepLine} />
              <div className={styles.depositStep}>
                <span className={styles.depositStepNumber}>3</span>
                <div>
                  <strong>Ready to bid</strong>
                  <span>all auctions unlock</span>
                </div>
              </div>
            </div>

            <Link href="/wallet" className="btn btn-primary btn-full">
              Add deposit — {formatAed(5000)}
            </Link>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Available right now</div>
          <div className={styles.availabilityGrid}>
            <article className={styles.availabilityTile}>
              <span>Live auctions</span>
              <strong className={styles.metricGreen}>{auctionCounts.live}</strong>
              <p>Open for bidding now</p>
            </article>
            <article className={styles.availabilityTile}>
              <span>Ending soon</span>
              <strong className={styles.metricAmber}>{auctionCounts.endingSoon}</strong>
              <p>Closing within 24 hours</p>
            </article>
            <article
              className={`${styles.availabilityTile} ${
                tier === "VIP" ? styles.availabilityVip : styles.availabilityLocked
              }`}
            >
              <span>Early access deals</span>
              <strong className={tier === "VIP" ? styles.metricGold : styles.metricMuted}>
                {tier === "VIP" ? auctionCounts.earlyAccess : "Locked"}
              </strong>
              <p>{tier === "VIP" ? "Available now" : "VIP only"}</p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Access & capabilities</div>
          <TierStatusCard
            id="tier-upgrade"
            tier={tier}
            requestedAt={dashboard.vipStatus.upgradeRequest?.requestedAt ?? null}
            embedded
          />
          <div className={styles.capabilitiesTable}>
            <div className={styles.capabilitiesHead}>Feature</div>
            <div className={styles.capabilitiesHead}>Standard</div>
            <div className={styles.capabilitiesHead}>
              VIP{tier === "VIP" ? " (you)" : ""}
            </div>

            {CAPABILITIES.map((row) => (
              <div key={row.feature} className={styles.capabilityRow}>
                <span className={styles.featureLabel}>{row.feature}</span>
                <span className={styles.capabilityCell}>
                  {row.standard === "yes" ? (
                    <IconCheck size={16} strokeWidth={2.4} />
                  ) : (
                    <span className={styles.capabilityDash}>—</span>
                  )}
                </span>
                <span
                  className={`${styles.capabilityCell} ${
                    row.vip === "yes" &&
                    (row.feature === "Buy before auction" || row.feature === "24h early lot access")
                      ? styles.capabilityVip
                      : ""
                  }`}
                >
                  {row.vip === "yes" ? (
                    <IconCheck size={16} strokeWidth={2.4} />
                  ) : (
                    <span className={styles.capabilityDash}>—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {hasRequiredDeposit ? (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Wallet summary</div>
            <div className={styles.walletSection}>
              <div className={styles.walletGrid}>
                <article className={styles.walletTile}>
                  <span>Available</span>
                  <strong className={styles.metricGreen}>
                    {formatAed(dashboard.depositStatus.balanceAed)}
                  </strong>
                </article>
                <article className={styles.walletTile}>
                  <span>Locked</span>
                  <strong className={styles.metricAmber}>
                    {formatAed(dashboard.depositStatus.lockedBalanceAed)}
                  </strong>
                </article>
                <article className={styles.walletTile}>
                  <span>Free to use</span>
                  <strong className={styles.metricGreen}>
                    {formatAed(dashboard.depositStatus.availableBalanceAed)}
                  </strong>
                </article>
              </div>
              <span className={styles.refundPill}>Fully refundable within 48 hours</span>
            </div>
          </section>
        ) : null}

        <RecommendedLots lots={dashboard.recommendedLots} />
      </div>
    </BuyerShell>
  );
}
