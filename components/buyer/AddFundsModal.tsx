"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./AddFundsModal.module.css";

type AddFundsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const QUICK_AMOUNTS = [5000, 10000, 25000] as const;

export function AddFundsModal({ isOpen, onClose }: AddFundsModalProps) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(5000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAmount(5000);
    setIsSubmitting(false);
    setErrorMessage("");
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const normalizedAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await api.wallet.topup(normalizedAmount);
      onClose();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "We could not start your payment right now. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <section className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2>Add funds</h2>
          </div>
        </header>

        <label className={styles.field}>
          <span>Amount (AED)</span>
          <input
            type="number"
            min="1"
            step="100"
            value={normalizedAmount || ""}
            onChange={(event) => setAmount(Number(event.target.value))}
            className={styles.input}
          />
        </label>

        <div className={styles.quickRow}>
          {QUICK_AMOUNTS.map((quickAmount) => (
            <button
              key={quickAmount}
              type="button"
              className={`${styles.quickButton} ${
                normalizedAmount === quickAmount ? styles.quickButtonActive : ""
              }`}
              onClick={() => setAmount(quickAmount)}
            >
              {formatAed(quickAmount)}
            </button>
          ))}
        </div>

        <div className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <span>Amount</span>
            <strong>{formatAed(normalizedAmount)}</strong>
          </div>
          <div className={styles.breakdownRow}>
            <span>Processing fee</span>
            <strong>{formatAed(0)}</strong>
          </div>
          <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
            <span>Total to pay</span>
            <strong>{formatAed(normalizedAmount)}</strong>
          </div>
        </div>

        <span className={styles.refundPill}>Fully refundable within 48 hours</span>

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || normalizedAmount <= 0}
          >
            {isSubmitting ? "Processing..." : `Pay ${formatAed(normalizedAmount)} via Stripe`}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
        </div>

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

        <p className={styles.footerNote}>Secured by Stripe · AED is the currency of record</p>
      </section>
    </div>
  );
}
