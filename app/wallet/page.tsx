import Link from "next/link";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { loadBuyerShellContext } from "@/src/lib/buyer_cabinet";
import { api } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type WalletResponse = {
  wallet?: {
    balance?: number;
    lockedBalance?: number;
    availableBalance?: number;
  };
  pendingWithdrawal?: number;
  transactions?: Array<{
    id: string;
    type: string;
    amount: number;
    reference: string | null;
    createdAt: string;
  }>;
};

function describeTransaction(type: string): string {
  const normalized = type.trim().toUpperCase();

  if (normalized === "DEPOSIT_TOPUP") {
    return "Deposit top-up";
  }

  if (normalized === "DEPOSIT_LOCK") {
    return "Deposit lock";
  }

  if (normalized === "DEPOSIT_RELEASE") {
    return "Deposit release";
  }

  if (normalized === "WITHDRAWAL_REQUESTED") {
    return "Withdrawal request";
  }

  if (normalized === "WITHDRAWAL_APPROVED") {
    return "Withdrawal approved";
  }

  if (normalized === "WITHDRAWAL") {
    return "Withdrawal";
  }

  if (normalized === "PAYMENT_RECEIVED") {
    return "Payment received";
  }

  if (normalized === "ADMIN_REFUND") {
    return "Admin refund";
  }

  return type.replace(/_/g, " ").toLowerCase();
}

function resolveAmountClass(type: string): string {
  const normalized = type.trim().toUpperCase();

  if (
    normalized === "DEPOSIT_TOPUP" ||
    normalized === "DEPOSIT_RELEASE" ||
    normalized === "PAYMENT_RECEIVED" ||
    normalized === "ADMIN_REFUND"
  ) {
    return styles.amountPositive;
  }

  if (
    normalized === "DEPOSIT_LOCK" ||
    normalized === "WITHDRAWAL" ||
    normalized === "WITHDRAWAL_REQUESTED" ||
    normalized === "WITHDRAWAL_APPROVED" ||
    normalized === "DEPOSIT_BURN"
  ) {
    return styles.amountNegative;
  }

  return styles.amountNeutral;
}

function resolveAmountPrefix(type: string): string {
  const normalized = type.trim().toUpperCase();

  if (
    normalized === "DEPOSIT_TOPUP" ||
    normalized === "DEPOSIT_RELEASE" ||
    normalized === "PAYMENT_RECEIVED" ||
    normalized === "ADMIN_REFUND"
  ) {
    return "+";
  }

  if (
    normalized === "DEPOSIT_LOCK" ||
    normalized === "WITHDRAWAL" ||
    normalized === "WITHDRAWAL_REQUESTED" ||
    normalized === "WITHDRAWAL_APPROVED" ||
    normalized === "DEPOSIT_BURN"
  ) {
    return "−";
  }

  return "";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <article className={[styles.metricCard, tone === "warning" ? styles.metricWarning : ""].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default async function WalletPage() {
  const { requestOptions, shellProps } = await loadBuyerShellContext("/wallet");
  const wallet = await api.wallet.get<WalletResponse>(requestOptions).catch(
    (): WalletResponse => ({
      wallet: {
        balance: 0,
        lockedBalance: 0,
        availableBalance: 0,
      },
      pendingWithdrawal: 0,
      transactions: [],
    }),
  );
  const available = Number(wallet.wallet?.availableBalance ?? 0);
  const locked = Number(wallet.wallet?.lockedBalance ?? 0);
  const pendingWithdrawal = Number(wallet.pendingWithdrawal ?? 0);
  const transactions = wallet.transactions ?? [];

  return (
    <BuyerShell
      activePage="wallet"
      invoicesDue={shellProps.invoicesDue}
      companyName={shellProps.companyName}
      companyEmail={shellProps.companyEmail}
      tier={shellProps.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Wallet</h1>
          <p>Manage your deposit, locks, and withdrawal requests.</p>
        </header>

        <section className={styles.metrics}>
          <MetricCard label="Available balance" value={formatAed(available)} />
          <MetricCard label="Locked — active auctions" value={formatAed(locked)} tone="warning" />
          <MetricCard label="Pending withdrawal" value={formatAed(pendingWithdrawal)} />
        </section>

        <span className={styles.refundPill}>
          Your deposit is fully refundable within 48 hours of your withdrawal request
        </span>

        <div className={styles.actions}>
          <Link href="/wallet#transactions" className={styles.primaryButton}>
            Add funds
          </Link>
          <Link href="/wallet#transactions" className={styles.secondaryButton}>
            Request withdrawal
          </Link>
        </div>

        <section className={styles.tableCard} id="transactions">
          <div className={styles.tableHeader}>
            <h2>Transactions</h2>
          </div>

          {transactions.length === 0 ? (
            <p className={styles.emptyState}>No transactions yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Transaction description</th>
                    <th>Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{describeTransaction(transaction.type)}</td>
                      <td>{formatDate(transaction.createdAt)}</td>
                      <td className={resolveAmountClass(transaction.type)}>
                        {resolveAmountPrefix(transaction.type)}
                        {formatAed(transaction.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </BuyerShell>
  );
}
