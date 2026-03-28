"use client";

import { useState } from "react";

import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./InvoicePaymentActions.module.css";

type InvoicePaymentActionsProps = {
  invoiceId: string;
  total: number;
  status: string;
};

type PayResponse = {
  stripe_payment_intent_id?: string | null;
};

export function InvoicePaymentActions({
  invoiceId,
  total,
  status,
}: InvoicePaymentActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handlePayNow(): Promise<void> {
    setIsSubmitting(true);
    setFeedback("");

    try {
      const response = await api.finance.invoices.pay<PayResponse>(invoiceId);
      setFeedback(
        response.stripe_payment_intent_id
          ? `Payment request created. Reference ${response.stripe_payment_intent_id}.`
          : "Payment request created successfully.",
      );
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "We could not start your payment right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.actions}>
        <button type="button" className="btn btn-outline" onClick={() => window.print()}>
          Download PDF
        </button>
        {status !== "PAID" ? (
          <button
            type="button"
            className={`btn btn-primary ${styles.primaryAction}`}
            onClick={() => void handlePayNow()}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Processing..." : `Pay now — ${formatAed(total)}`}
          </button>
        ) : null}
      </div>
      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
    </div>
  );
}
