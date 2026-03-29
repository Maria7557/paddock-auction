import { BuyerShell } from "@/components/buyer/BuyerShell";
import { WalletWorkspace } from "@/components/buyer/WalletWorkspace";
import { api, getWalletBalance, type BuyerBuyingPowerResponse } from "@/src/lib/api-client";
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

function parseMoneyString(value: string): number {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export default async function WalletPage() {
  const session = await requireBuyerSession("/wallet");
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [walletBalance, buyingPower, dashboard, authResponse] = await Promise.all([
    getWalletBalance(requestOptions),
    api.buyer.buyingPower<BuyerBuyingPowerResponse>(requestOptions),
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
          availableBalance={parseMoneyString(walletBalance.availableBalance)}
          lockedBalance={parseMoneyString(walletBalance.lockedBalance)}
          buyingPower={{
            depositAmount: parseMoneyString(buyingPower.depositAmount),
            ceiling: parseMoneyString(buyingPower.ceiling),
            activeBidsTotal: parseMoneyString(buyingPower.activeBidsTotal),
            remaining: parseMoneyString(buyingPower.remaining),
          }}
          pendingWithdrawalAmount={parseMoneyString(walletBalance.pendingWithdrawalBalance)}
          transactions={[]}
        />
      </div>
    </BuyerShell>
  );
}
