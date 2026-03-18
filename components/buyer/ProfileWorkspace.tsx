"use client";

import { useMemo, useState } from "react";

import { VipUpgradeModal } from "@/components/buyer/VipUpgradeModal";

import styles from "./ProfileWorkspace.module.css";

type ProfileWorkspaceProps = {
  tier: "STANDARD" | "VIP";
  companyName: string;
  companyEmail: string;
  tradeLicence: string | null;
  contactPhone: string | null;
  accountStatus: string | null;
  memberSince: string | null;
};

function getInitials(companyName: string): string {
  const parts = companyName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "FB";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function formatMemberSince(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatAccountStatus(value: string | null): {
  label: string;
  isActive: boolean;
} {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (!normalized) {
    return {
      label: "—",
      isActive: false,
    };
  }

  if (normalized === "ACTIVE") {
    return {
      label: "Active",
      isActive: true,
    };
  }

  return {
    label: normalized
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    isActive: false,
  };
}

export function ProfileWorkspace({
  tier,
  companyName,
  companyEmail,
  tradeLicence,
  contactPhone,
  accountStatus,
  memberSince,
}: ProfileWorkspaceProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const initials = useMemo(() => getInitials(companyName), [companyName]);
  const status = useMemo(() => formatAccountStatus(accountStatus), [accountStatus]);
  const buyerTierLabel =
    tier === "VIP" ? "VIP · Early access · 4% commission" : "Standard · 2% commission";

  return (
    <div className={styles.workspace}>
      {tier === "STANDARD" ? (
        <section className={styles.vipBanner}>
          <div className={styles.vipCopy}>
            <h2>Upgrade to VIP — get early access to vehicles</h2>
            <p>Buy vehicles before auction starts. Available now.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
            Get early access
          </button>
        </section>
      ) : null}

      <section className={styles.detailsCard}>
        <div className={styles.cardHead}>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {initials}
            </span>
            <div className={styles.identityCopy}>
              <strong>{companyName}</strong>
              <span>{companyEmail}</span>
            </div>
          </div>
        </div>

        <dl className={styles.fields}>
          <div className={styles.field}>
            <dt>Company name</dt>
            <dd>{companyName || "—"}</dd>
          </div>
          <div className={styles.field}>
            <dt>Trade licence</dt>
            <dd>{tradeLicence || "—"}</dd>
          </div>
          <div className={styles.field}>
            <dt>Contact phone</dt>
            <dd>{contactPhone || "—"}</dd>
          </div>
          <div className={styles.field}>
            <dt>Email</dt>
            <dd>{companyEmail || "—"}</dd>
          </div>
          <div className={styles.field}>
            <dt>Account status</dt>
            <dd>
              <span
                className={`${styles.statusBadge} ${
                  status.isActive ? styles.statusBadgeActive : styles.statusBadgeNeutral
                }`}
              >
                {status.label}
              </span>
            </dd>
          </div>
          <div className={styles.field}>
            <dt>Buyer tier</dt>
            <dd>{buyerTierLabel}</dd>
          </div>
          <div className={styles.field}>
            <dt>Member since</dt>
            <dd>{formatMemberSince(memberSince)}</dd>
          </div>
        </dl>
      </section>

      <VipUpgradeModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
