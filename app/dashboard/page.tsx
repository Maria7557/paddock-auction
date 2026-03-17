import { ActivityTimeline } from "@/components/buyer/ActivityTimeline";
import { DepositCard } from "@/components/buyer/DepositCard";
import { OnboardingProgress } from "@/components/buyer/OnboardingProgress";
import { RecommendedLots } from "@/components/buyer/RecommendedLots";
import { VipPromoBanner } from "@/components/buyer/VipPromoBanner";
import { MetricTile } from "@/components/seller/MetricTile";
import { api } from "@/src/lib/api-client";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";
import { formatAed } from "@/src/lib/utils";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type BuyerDashboardResponse = {
  metrics: {
    activeBids: number;
    watching: number;
    invoicesDue: number;
    depositBalance: number;
    depositLocked: number;
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
    imageUrl?: string;
  }>;
  vipStatus: {
    tier: "STANDARD" | "VIP";
    upgradeRequest: { status: string; requestedAt: string } | null;
  };
};

export default async function DashboardPage() {
  await requireBuyerSession("/dashboard");

  const requestOptions = await withServerCookies({ cache: "no-store" });
  const dashboard = await api.buyer.dashboard<BuyerDashboardResponse>(requestOptions);
  const upgradeStatus: "NONE" | "PENDING" | "APPROVED" =
    dashboard.vipStatus.upgradeRequest?.status === "PENDING"
      ? "PENDING"
      : dashboard.vipStatus.upgradeRequest?.status === "APPROVED"
        ? "APPROVED"
        : "NONE";

  return (
    <MarketShell>
      <div className={styles.page}>
        {dashboard.onboardingStep < 4 ? (
          <OnboardingProgress step={dashboard.onboardingStep} />
        ) : null}

        <section className={styles.metrics}>
          <MetricTile label="Active bids" value={dashboard.metrics.activeBids} />
          <MetricTile label="Watching" value={dashboard.metrics.watching} />
          <MetricTile label="Invoices due" value={dashboard.metrics.invoicesDue} />
          <MetricTile label="Deposit balance" value={formatAed(dashboard.metrics.depositBalance)} />
        </section>

        <section className={styles.split}>
          <DepositCard
            available={dashboard.metrics.depositBalance}
            locked={dashboard.metrics.depositLocked}
          />

          {dashboard.onboardingStep === 4 ? (
            <ActivityTimeline events={dashboard.recentActivity} />
          ) : (
            <RecommendedLots lots={dashboard.recommendedLots} />
          )}
        </section>

        {dashboard.vipStatus.tier === "STANDARD" ? (
          <VipPromoBanner
            tier={dashboard.vipStatus.tier}
            upgradeStatus={upgradeStatus}
          />
        ) : null}
      </div>
    </MarketShell>
  );
}
