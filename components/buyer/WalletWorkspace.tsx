"use client";

import { useMemo, useState } from "react";

import { formatAed } from "@/src/lib/utils";

import { AddFundsModal } from "./AddFundsModal";
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
  buyingPower: {
    depositAmount: number;
    ceiling: number;
    activeBidsTotal: number;
    remaining: number;
  };
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
  buyingPower,
  pendingWithdrawalAmount,
  transactions,
}: WalletWorkspaceProps) {
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);

  const metricCards = useMemo(
    () => [
      {
        label: "Available balance",
        value: formatAed(availableBalance),
        toneClass: styles.metricValuePositive,
      },
      {
        label: "Locked",
        value: formatAed(lockedBalance),
        toneClass: styles.metricValueMuted,
      },
      {
        label: "Active bids",
        value: formatAed(buyingPower.activeBidsTotal),
        toneClass: styles.metricValueAmber,
      },
      {
        label: "Remaining",
        value: formatAed(buyingPower.remaining),
        toneClass: styles.metricValuePositive,
      },
    ],
    [availableBalance, buyingPower.activeBidsTotal, buyingPower.remaining, lockedBalance],
  );

  return (
    <div className={styles.workspace}>
      <div className={styles.metricGrid}>
        {metricCards.map((card) => (
          <article key={card.label} className={styles.metricCard}>
            <span className={styles.metricLabel}>{card.label}</span>
            <strong className={`${styles.metricValue} ${card.toneClass}`}>{card.value}</strong>
          </article>
        ))}
      </div>

      <span className={styles.refundPill}>
        Your deposit is fully refundable within 48 hours of your withdrawal request
      </span>

      {pendingWithdrawalAmount > 0 ? (
        <span className={styles.pendingPill}>
          {`Pending withdrawal: ${formatAed(pendingWithdrawalAmount)}`}
        </span>
      ) : null}

      <div className={styles.actionRow}>
        <button type="button" className="btn btn-primary" onClick={() => setIsAddFundsOpen(true)}>
          Add funds
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setIsWithdrawalOpen(true)}>
          Request withdrawal
        </button>
      </div>

      <AddFundsModal isOpen={isAddFundsOpen} onClose={() => setIsAddFundsOpen(false)} />
      <WithdrawalModal
        isOpen={isWithdrawalOpen}
        onClose={() => setIsWithdrawalOpen(false)}
        availableBalance={availableBalance}
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
