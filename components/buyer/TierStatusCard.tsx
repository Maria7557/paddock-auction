"use client";

import { useMemo, useState } from "react";

import { VipUpgradeModal } from "@/components/buyer/VipUpgradeModal";

import styles from "./TierStatusCard.module.css";

type TierStatusCardProps = {
  id?: string;
  tier: "STANDARD" | "VIP";
  requestedAt: string | null;
  embedded?: boolean;
};

const VIP_VALIDITY_DAYS = 30;

function addDays(input: Date, days: number): Date {
  const next = new Date(input);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function buildVipDates(requestedAt: string | null): {
  activatedAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
} {
  if (!requestedAt) {
    return {
      activatedAt: null,
      expiresAt: null,
      isExpired: false,
      daysUntilExpiry: null,
    };
  }

  const activatedAt = new Date(requestedAt);

  if (Number.isNaN(activatedAt.getTime())) {
    return {
      activatedAt: null,
      expiresAt: null,
      isExpired: false,
      daysUntilExpiry: null,
    };
  }

  const expiresAt = addDays(activatedAt, VIP_VALIDITY_DAYS);
  const diffMs = expiresAt.getTime() - Date.now();
  const rawDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  return {
    activatedAt,
    expiresAt,
    isExpired: rawDays < 0,
    daysUntilExpiry: rawDays >= 0 ? rawDays : 0,
  };
}

function PerkRow({
  label,
  tone,
}: {
  label: string;
  tone: "locked" | "vip" | "expired";
}) {
  return (
    <li className={`${styles.perkItem} ${styles[`perk${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
      <span className={styles.perkDot} aria-hidden="true" />
      <span>{label}</span>
    </li>
  );
}

export function TierStatusCard({ id, tier, requestedAt, embedded = false }: TierStatusCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const vipDates = useMemo(() => buildVipDates(requestedAt), [requestedAt]);
  const wrapClassName = embedded ? styles.wrapEmbedded : styles.wrap;
  const baseCardClassName = `${styles.card} ${embedded ? styles.cardEmbedded : ""}`;

  if (tier === "VIP" && vipDates.isExpired) {
    return (
      <div className={wrapClassName} id={id}>
        <section className={`${baseCardClassName} ${styles.cardExpired}`}>
          <div className={styles.header}>
            <span className={`${styles.badge} ${styles.badgeExpired}`}>VIP expired</span>
          </div>
          <div className={styles.body}>
            <div className={styles.copy}>
              <h2>Your early access has ended</h2>
              <p>
                Your VIP access expired on{" "}
                {vipDates.expiresAt ? formatDateLabel(vipDates.expiresAt) : "—"}. You&apos;re now on
                Standard access.
              </p>
            </div>
            <ul className={styles.perkList}>
              <PerkRow label="Buy Now access — no longer available" tone="expired" />
              <PerkRow label="24h early access — no longer available" tone="expired" />
            </ul>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setModalOpen(true)}
            >
              Renew early access
            </button>
          </div>
        </section>

        <VipUpgradeModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </div>
    );
  }

  if (tier === "VIP") {
    return (
      <div className={wrapClassName} id={id}>
        <section className={`${baseCardClassName} ${styles.cardVip}`}>
          <div className={styles.header}>
            <span className={`${styles.badge} ${styles.badgeVip}`}>VIP buyer</span>
            {vipDates.expiresAt ? (
              <div className={styles.validityBlock}>
                <span className={styles.validityText}>
                  Valid until {formatDateLabel(vipDates.expiresAt)}
                </span>
                {vipDates.daysUntilExpiry !== null && vipDates.daysUntilExpiry <= 7 ? (
                  <span className={styles.expiryPill}>
                    Expires in {vipDates.daysUntilExpiry} day{vipDates.daysUntilExpiry === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={styles.body}>
            <div className={styles.copy}>
              <h2>You have early access</h2>
            </div>
            <ul className={styles.perkList}>
              <PerkRow label="24h early access to lots" tone="vip" />
              <PerkRow label="Buy before auction starts" tone="vip" />
              <PerkRow label="Priority support" tone="vip" />
            </ul>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={wrapClassName} id={id}>
      <section className={baseCardClassName}>
        <div className={styles.header}>
          <span className={`${styles.badge} ${styles.badgeStandard}`}>Standard buyer</span>
        </div>
        <div className={styles.body}>
          <div className={styles.copy}>
            <h2>Get early access to vehicles</h2>
            <p className={styles.promo}>Promo: 4% commission until 1 May</p>
          </div>
          <ul className={styles.perkList}>
            <PerkRow label="24h early access to lots" tone="locked" />
            <PerkRow label="Buy before auction starts" tone="locked" />
            <PerkRow label="Priority support" tone="locked" />
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalOpen(true)}
          >
            Upgrade to VIP
          </button>
        </div>
      </section>

      <VipUpgradeModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
