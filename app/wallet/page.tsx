import { BuyerShell } from "@/components/buyer/BuyerShell";
import { WalletWorkspace } from "@/components/buyer/WalletWorkspace";
import { api } from "@/src/lib/api-client";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type BuyerDashboardResponse = {
  metrics: {
    invoicesDue: number;
  };
  vipStatus: {
    tier: "STANDARD" | "VIP";
  };
};

type BuyerAuthResponse = {
  user?: {
    email?: string;
  };
};

type WalletResponse = {
  wallet: {
    balance: number;
    lockedBalance: number;
    availableBalance: number;
  };
  transactions?: Array<{
    id: string;
    type: string;
    amount: number;
    reference: string | null;
    createdAt: string;
  }>;
  pendingWithdrawalAmount?: number;
};

export default async function WalletPage() {
  const session = await requireBuyerSession("/wallet");
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [walletResponse, dashboard, authResponse] = await Promise.all([
    api.wallet.get<WalletResponse>(requestOptions),
    api.buyer.dashboard<BuyerDashboardResponse>(requestOptions),
    api.auth.me<BuyerAuthResponse>(requestOptions),
  ]);

  const companyName = session.companyName?.trim() || "Buyer company";
  const companyEmail = authResponse.user?.email?.trim() || "buyer@fleetbid.ae";

  return (
    <BuyerShell
      activePage="wallet"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={companyName}
      companyEmail={companyEmail}
      tier={dashboard.vipStatus.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Wallet</h1>
          <p>Manage your deposit, locks, and withdrawals</p>
        </header>

        <WalletWorkspace
          availableBalance={walletResponse.wallet.availableBalance}
          lockedBalance={walletResponse.wallet.lockedBalance}
          pendingWithdrawalAmount={walletResponse.pendingWithdrawalAmount ?? 0}
          transactions={walletResponse.transactions ?? []}
        />
      </div>
    </BuyerShell>
  );
}
