"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { IconCheck, IconX } from "@/components/ui/icons";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./WithdrawalModal.module.css";

type WithdrawalModalProps = {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
};

type WalletResponse = {
  withdrawalEligibility?: {
    noActiveAuctionLocks: boolean;
    noOutstandingInvoices: boolean;
    noComplianceHolds: boolean;
    canWithdraw: boolean;
  };
};

type EligibilityItem = {
  label: string;
  passed: boolean;
};

export function WithdrawalModal({
  isOpen,
  onClose,
  availableBalance,
}: WithdrawalModalProps) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(availableBalance);
  const [isLoadingChecks, setIsLoadingChecks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [eligibility, setEligibility] = useState<WalletResponse["withdrawalEligibility"] | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAmount(availableBalance);
    setErrorMessage("");
    setEligibility(null);
    setIsSubmitting(false);
    setIsLoadingChecks(true);

    void api.wallet
      .get<WalletResponse>()
      .then((response) => {
        setEligibility(
          response.withdrawalEligibility ?? {
            noActiveAuctionLocks: false,
            noOutstandingInvoices: false,
            noComplianceHolds: false,
            canWithdraw: false,
          },
        );
      })
      .catch((error) => {
        setErrorMessage(
          getApiErrorMessage(error, "We could not verify your withdrawal eligibility right now."),
        );
      })
      .finally(() => {
        setIsLoadingChecks(false);
      });
  }, [availableBalance, isOpen]);

  const normalizedAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const items = useMemo<EligibilityItem[]>(
    () => [
      {
        label: "No active auction locks",
        passed: eligibility?.noActiveAuctionLocks === true,
      },
      {
        label: "No outstanding invoices",
        passed: eligibility?.noOutstandingInvoices === true,
      },
      {
        label: "No compliance holds",
        passed: eligibility?.noComplianceHolds === true,
      },
    ],
    [eligibility],
  );

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await api.wallet.withdraw(normalizedAmount);
      onClose();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "We could not submit your withdrawal request. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit =
    eligibility?.canWithdraw === true &&
    normalizedAmount > 0 &&
    normalizedAmount <= availableBalance &&
    !isSubmitting;

  return (
    <div className={styles.overlay}>
      <section className={styles.modal}>
        <header className={styles.header}>
          <h2>Request withdrawal</h2>
        </header>

        <div className={styles.checks}>
          {isLoadingChecks ? <p className={styles.loading}>Checking eligibility…</p> : null}

          {items.map((item) => (
            <div key={item.label} className={styles.checkRow}>
              <span
                className={`${styles.checkIcon} ${
                  item.passed ? styles.checkIconPass : styles.checkIconFail
                }`}
                aria-hidden="true"
              >
                {item.passed ? <IconCheck size={16} strokeWidth={2.5} /> : <IconX size={16} strokeWidth={2.5} />}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <label className={styles.field}>
          <span>Amount (max {formatAed(availableBalance)})</span>
          <input
            type="number"
            min="0"
            max={availableBalance}
            step="100"
            value={normalizedAmount || ""}
            onChange={(event) => setAmount(Number(event.target.value))}
            className={styles.input}
          />
        </label>

        <p className={styles.note}>Returned to your original payment method</p>

        <div className={styles.warningBox}>
          Processing takes 3–5 business days after approval. Withdrawal blocks bidding until
          complete.
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {isSubmitting ? "Submitting..." : "Submit withdrawal request"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
        </div>

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
      </section>
    </div>
  );
}
