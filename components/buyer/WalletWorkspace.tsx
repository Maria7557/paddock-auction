"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getWalletBalance } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";
import WalletTopupForm from "@/src/components/wallet/WalletTopupForm";

import { WithdrawalModal } from "./WithdrawalModal";
import styles from "./WalletWorkspace.module.css";

type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  reference: string | null;
  createdAt: string;
};

type WalletWorkspaceProps = {
  availableBalance: number;
  lockedBalance: number;
  pendingWithdrawalAmount: number;
  transactions: WalletTransaction[];
};

type TransactionTone = "positive" | "lock" | "withdrawal";

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function resolveTransactionMeta(type: string): {
  description: string;
  tone: TransactionTone;
  sign: "+" | "−";
  badge?: string;
} {
  if (type === "DEPOSIT_TOPUP") {
    return {
      description: "Deposit top-up",
      tone: "positive",
      sign: "+",
    };
  }

  if (type === "PAYMENT_RECEIVED" || type === "DEPOSIT_RELEASE" || type === "ADMIN_REFUND") {
    return {
      description: "Funds returned",
      tone: "positive",
      sign: "+",
    };
  }

  if (type === "DEPOSIT_LOCK" || type === "DEPOSIT_BURN") {
    return {
      description: "Auction lock",
      tone: "lock",
      sign: "−",
      badge: "Lock",
    };
  }

  return {
    description: "Withdrawal request",
    tone: "withdrawal",
    sign: "−",
  };
}

export function WalletWorkspace({
  availableBalance,
  lockedBalance,
  pendingWithdrawalAmount,
  transactions,
}: WalletWorkspaceProps) {
  const [walletState, setWalletState] = useState({
    availableBalance,
    lockedBalance,
    pendingWithdrawalAmount,
  });
  const [showTopup, setShowTopup] = useState(false);
  const [topupDone, setTopupDone] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);
  const successTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setWalletState({
      availableBalance,
      lockedBalance,
      pendingWithdrawalAmount,
    });
  }, [availableBalance, lockedBalance, pendingWithdrawalAmount]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const metricCards = useMemo(
    () => [
      {
        label: "Available balance",
        value: formatAed(walletState.availableBalance),
        toneClass: styles.metricValuePositive,
        detail: "Fully refundable",
      },
      {
        label: "Locked — active auctions",
        value: formatAed(walletState.lockedBalance),
        toneClass: styles.metricValueAmber,
      },
      {
        label: "Pending withdrawal",
        value: formatAed(walletState.pendingWithdrawalAmount),
        toneClass: styles.metricValueMuted,
      },
    ],
    [walletState.availableBalance, walletState.lockedBalance, walletState.pendingWithdrawalAmount],
  );

  const handleTopupSuccess = async () => {
    setShowTopup(false);
    setTopupDone(true);

    try {
      const freshWallet = await getWalletBalance({ cache: "no-store" });

      setWalletState({
        availableBalance: Number(freshWallet.availableBalance),
        lockedBalance: Number(freshWallet.lockedBalance),
        pendingWithdrawalAmount: Number(freshWallet.pendingWithdrawalBalance),
      });
    } catch {
      // Keep the optimistic success state even if the refresh lags behind.
    }

    if (successTimeoutRef.current !== null) {
      window.clearTimeout(successTimeoutRef.current);
    }

    successTimeoutRef.current = window.setTimeout(() => {
      setTopupDone(false);
    }, 5000);
  };

  return (
    <div className={styles.workspace}>
      {topupDone ? (
        <div className={styles.successBanner}>✓ Funds received — your balance has been updated</div>
      ) : null}

      <div className={styles.metricGrid}>
        {metricCards.map((card) => (
          <article key={card.label} className={styles.metricCard}>
            <span className={styles.metricLabel}>{card.label}</span>
            <strong className={`${styles.metricValue} ${card.toneClass}`}>{card.value}</strong>
            {card.detail ? <span className={styles.metricDetail}>{card.detail}</span> : null}
          </article>
        ))}
      </div>

      <span className={styles.refundPill}>
        Your deposit is fully refundable within 48 hours of your withdrawal request
      </span>

      <div className={styles.actionRow}>
        <button type="button" className="btn btn-primary" onClick={() => setShowTopup(true)}>
          Add funds
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setIsWithdrawalOpen(true)}>
          Request withdrawal
        </button>
      </div>

      {showTopup ? (
        <div className={styles.topupFormWrap}>
          <WalletTopupForm onSuccess={() => void handleTopupSuccess()} onCancel={() => setShowTopup(false)} />
        </div>
      ) : null}

      <WithdrawalModal
        isOpen={isWithdrawalOpen}
        onClose={() => setIsWithdrawalOpen(false)}
        availableBalance={walletState.availableBalance}
      />

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2>Transactions</h2>
        </div>

        {transactions.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No wallet activity yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => {
                  const meta = resolveTransactionMeta(transaction.type);

                  return (
                    <tr key={transaction.id}>
                      <td>
                        <div className={styles.descriptionCell}>
                          <strong>{meta.description}</strong>
                          {transaction.reference ? (
                            <span className={styles.reference}>{transaction.reference}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatDateLabel(transaction.createdAt)}</td>
                      <td>
                        <div className={styles.amountCell}>
                          <strong
                            className={`${styles.amountValue} ${
                              meta.tone === "positive"
                                ? styles.amountPositive
                                : meta.tone === "lock"
                                  ? styles.amountLock
                                  : styles.amountWithdrawal
                            }`}
                          >
                            {`${meta.sign}${formatAed(transaction.amount)}`}
                          </strong>
                          {meta.badge ? <span className={styles.amountBadge}>{meta.badge}</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
