"use client";

import { useState } from "react";

import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./VipUpgradeModal.module.css";

type VipUpgradeModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type SubmitState = "idle" | "loading" | "success";

export function VipUpgradeModal({ isOpen, onClose }: VipUpgradeModalProps) {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    setSubmitState("loading");
    setErrorMessage("");

    try {
      await api.buyer.vip.request();
      setSubmitState("success");
    } catch (error) {
      setSubmitState("idle");
      setErrorMessage(getApiErrorMessage(error, "We could not submit your application. Please try again."));
    }
  }

  return (
    <div className={styles.overlay}>
      <section className={styles.modal} aria-live="polite">
        <div className={styles.head}>
          <h3>Become a VIP buyer</h3>
        </div>

        <div className={styles.table}>
          <div className={styles.column}>
            <strong>Standard</strong>
            <span>2% commission</span>
            <ul>
              <li>Auction participation</li>
              <li>Pre-bids</li>
            </ul>
          </div>
          <div className={styles.column}>
            <strong>VIP</strong>
            <span>4% commission</span>
            <ul>
              <li>Auction participation</li>
              <li>Pre-bids</li>
              <li>Buy Now purchase access</li>
              <li>Pre-auction purchase</li>
            </ul>
          </div>
        </div>

        <p className={styles.note}>
          Deposit {formatAed(5000)} — fully refundable within 24 hours
        </p>

        {submitState === "success" ? (
          <div className={styles.feedback}>
            <p>Application submitted. We&apos;ll review it within 1–2 business days.</p>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSubmit()}
              disabled={submitState === "loading"}
            >
              {submitState === "loading" ? "Submitting..." : "Submit application"}
            </button>
            {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
