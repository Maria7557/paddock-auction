import Link from "next/link";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { RecommendedLots } from "@/components/buyer/RecommendedLots";
import { VipPromoBanner } from "@/components/buyer/VipPromoBanner";
import { loadBuyerShellContext } from "@/src/lib/buyer_cabinet";
import { api } from "@/src/lib/api-client";
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

function resolveUpgradeStatus(
  status: string | null | undefined,
): "NONE" | "PENDING" | "APPROVED" {
  if (status === "PENDING") {
    return "PENDING";
  }

  if (status === "APPROVED") {
    return "APPROVED";
  }

  return "NONE";
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger";
}) {
  return (
    <article className={[styles.metricCard, tone === "danger" ? styles.metricDanger : ""].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default async function DashboardPage() {
  const { requestOptions, session, shellProps } = await loadBuyerShellContext("/dashboard");
  const dashboard = await api.buyer.dashboard<BuyerDashboardResponse>(requestOptions);

  return (
    <BuyerShell
      activePage="dashboard"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={shellProps.companyName}
      companyEmail={shellProps.companyEmail}
      tier={dashboard.vipStatus.tier}
    >
      <div className={styles.page}>
        {dashboard.onboardingStep < 3 ? (
          <section className={styles.depositCta}>
            <div className={styles.depositHeader}>
              <div className={styles.depositCopy}>
                <h1>Add a deposit to start bidding</h1>
                <p>
                  A refundable deposit of AED 5,000 is required to participate in auctions.
                  Once received, our team reviews it within 12 hours — then you&apos;re ready to
                  bid.
                </p>
                <span className={styles.refundPill}>
                  Fully refundable within 48 hours of your request
                </span>
              </div>

              <div className={styles.depositAmount}>
                <strong>{formatAed(5000)}</strong>
                <span>required deposit</span>
              </div>
            </div>

            <div className={styles.depositProgress}>
              <div className={styles.progressStep}>
                <span className={styles.progressDone}>1</span>
                <div>
                  <strong>Add deposit</strong>
                  <span>via Wallet</span>
                </div>
              </div>
              <div className={styles.progressStep}>
                <span className={styles.progressPending}>2</span>
                <div>
                  <strong>Review</strong>
                  <span>up to 12 hours</span>
                </div>
              </div>
              <div className={styles.progressStep}>
                <span className={styles.progressPending}>3</span>
                <div>
                  <strong>Ready to bid</strong>
                  <span>all auctions unlock</span>
                </div>
              </div>
            </div>

            <Link href="/wallet" className={styles.primaryButton}>
              Add deposit — {formatAed(5000)}
            </Link>
          </section>
        ) : null}

        <section className={styles.metrics}>
          <MetricCard label="Active bids" value={dashboard.metrics.activeBids} />
          <MetricCard label="Watching" value={dashboard.metrics.watching} />
          <MetricCard
            label="Invoices due"
            value={dashboard.metrics.invoicesDue}
            tone={dashboard.metrics.invoicesDue > 0 ? "danger" : "default"}
          />
        </section>

        {dashboard.onboardingStep < 4 ? (
          <RecommendedLots
            lots={dashboard.recommendedLots}
            heading="Start here — active auctions"
            browseHref="/auctions"
            browseLabel="Browse all →"
          />
        ) : null}

        {dashboard.vipStatus.tier === "STANDARD" ? (
          <VipPromoBanner
            tier={dashboard.vipStatus.tier}
            upgradeStatus={resolveUpgradeStatus(dashboard.vipStatus.upgradeRequest?.status)}
          />
        ) : null}
      </div>
    </BuyerShell>
  );
}
