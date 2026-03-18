"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { IconCheck } from "@/components/ui/icons";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./VipUpgradeModal.module.css";

type VipUpgradeModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type SubmitState = "idle" | "loading" | "success";

type UpgradeResponse = {
  status: "APPROVED";
  activatedAt: string;
  expiresAt: string;
};

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function VipUpgradeModal({ isOpen, onClose }: VipUpgradeModalProps) {
  const router = useRouter();
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [activation, setActivation] = useState<UpgradeResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSubmitState("idle");
      setErrorMessage("");
      setActivation(null);
    }
  }, [isOpen]);

  const validityCopy = useMemo(() => {
    if (!activation) {
      return null;
    }

    return {
      activatedAt: formatDateLabel(activation.activatedAt),
      expiresAt: formatDateLabel(activation.expiresAt),
    };
  }, [activation]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    setSubmitState("loading");
    setErrorMessage("");

    try {
      const response = await api.buyer.upgradeToVip<UpgradeResponse>();
      setActivation(response);
      setSubmitState("success");
    } catch (error) {
      setSubmitState("idle");
      setErrorMessage(
        getApiErrorMessage(error, "We could not activate early access right now. Please try again."),
      );
    }
  }

  function handleCloseAndRefresh(): void {
    onClose();
    router.refresh();
  }

  return (
    <div className={styles.overlay}>
      <section className={styles.modal} aria-live="polite">
        <div className={styles.head}>
          <h3>Get early access to vehicles</h3>
        </div>

        {submitState === "success" && activation && validityCopy ? (
          <div className={styles.successState}>
            <span className={styles.successIcon} aria-hidden="true">
              <IconCheck size={20} strokeWidth={2.5} />
            </span>
            <div className={styles.successCopy}>
              <h4>Early access activated</h4>
              <p>
                You now have 24h early access and can purchase before auction starts.
              </p>
            </div>

            <div className={styles.validityCard}>
              <div>
                <span>Activated</span>
                <strong>{validityCopy.activatedAt}</strong>
              </div>
              <div>
                <span>Expires</span>
                <strong>{validityCopy.expiresAt}</strong>
              </div>
            </div>

            <p className={styles.promoNote}>Promo commission: 4% until 1 May</p>

            <button type="button" className="btn btn-primary" onClick={handleCloseAndRefresh}>
              Go to dashboard
            </button>
          </div>
        ) : (
          <>
            <div className={styles.table}>
              <article className={styles.column}>
                <strong>Standard access</strong>
                <ul>
                  <li>
                    <span>Join auctions</span>
                    <em>✓</em>
                  </li>
                  <li>
                    <span>Pre-bids</span>
                    <em>✓</em>
                  </li>
                  <li>
                    <span>Deposit {formatAed(5000)} (refundable)</span>
                    <em>✓</em>
                  </li>
                  <li>
                    <span>Buy before auction</span>
                    <em>—</em>
                  </li>
                  <li>
                    <span>24h early access</span>
                    <em>—</em>
                  </li>
                </ul>
              </article>

              <article className={`${styles.column} ${styles.columnVip}`}>
                <strong>VIP — Early access</strong>
                <ul>
                  <li>
                    <span>Join auctions</span>
                    <em className={styles.highlight}>✓</em>
                  </li>
                  <li>
                    <span>Pre-bids</span>
                    <em className={styles.highlight}>✓</em>
                  </li>
                  <li>
                    <span>Deposit {formatAed(5000)} (refundable)</span>
                    <em className={styles.highlight}>✓</em>
                  </li>
                  <li>
                    <span>Buy before auction</span>
                    <em className={styles.highlight}>✓</em>
                  </li>
                  <li>
                    <span>24h early access</span>
                    <em className={styles.highlight}>✓</em>
                  </li>
                </ul>
              </article>
            </div>

            <p className={styles.promoNote}>Promo commission: 4% until 1 May 2026</p>

            <div className={styles.divider} />

            <div className={styles.supportBlock}>
              <div className={styles.supportCopy}>
                <h4>Have questions? Talk to our team</h4>
              </div>
              <div className={styles.supportActions}>
                <a
                  href="https://wa.me/971500000000"
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.supportButton} ${styles.whatsAppButton}`}
                >
                  WhatsApp
                </a>
                <a
                  href="https://t.me/fleetbidsupport"
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.supportButton} ${styles.telegramButton}`}
                >
                  Telegram
                </a>
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSubmit()}
                disabled={submitState === "loading"}
              >
                {submitState === "loading" ? "Activating..." : "Get early access"}
              </button>
              {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
