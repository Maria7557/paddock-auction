import { BuyerShell } from "@/components/buyer/BuyerShell";
import { ProfileWorkspace } from "@/components/buyer/ProfileWorkspace";
import { api } from "@/src/lib/api-client";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type BuyerVipStatusResponse = {
  tier: "STANDARD" | "VIP";
  upgradeRequest: {
    status: string;
    requestedAt: string;
  } | null;
};

type BuyerDashboardResponse = {
  metrics: {
    invoicesDue: number;
  };
};

type BuyerAuthResponse = {
  user?: {
    email?: string;
    companyUsers?: Array<{
      companyId?: string;
      role?: string;
      company?: {
        name?: string;
        registrationNumber?: string;
        status?: string;
      } | null;
    }>;
  };
};

export default async function ProfilePage() {
  const session = await requireBuyerSession("/profile");
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [vipStatus, dashboard, authResponse] = await Promise.all([
    api.buyer.vip.status<BuyerVipStatusResponse>(requestOptions),
    api.buyer.dashboard<BuyerDashboardResponse>(requestOptions),
    api.auth.me<BuyerAuthResponse>(requestOptions),
  ]);

  const companyUser =
    authResponse.user?.companyUsers?.find(
      (candidate) => candidate.companyId === session.companyId || candidate.role === "BUYER_BIDDER",
    ) ?? null;
  const company = companyUser?.company ?? null;
  const companyName = session.companyName?.trim() || company?.name?.trim() || "Buyer company";
  const companyEmail = authResponse.user?.email?.trim() || "buyer@fleetbid.ae";

  return (
    <BuyerShell
      activePage="profile"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={companyName}
      companyEmail={companyEmail}
      tier={vipStatus.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Profile</h1>
          <p>Your company details and account settings</p>
        </header>

        <ProfileWorkspace
          tier={vipStatus.tier}
          companyName={companyName}
          companyEmail={companyEmail}
          tradeLicence={company?.registrationNumber?.trim() || null}
          contactPhone={null}
          accountStatus={company?.status?.trim() || session.companyStatus?.trim() || null}
          memberSince={null}
        />
      </div>
    </BuyerShell>
  );
}
