import { BuyerShell } from "@/components/buyer/BuyerShell";
import { ProfileVipBanner } from "@/components/buyer/ProfileVipBanner";
import { loadBuyerShellContext } from "@/src/lib/buyer_cabinet";
import { api } from "@/src/lib/api-client";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type VipStatusResponse = {
  tier: "STANDARD" | "VIP";
  upgradeRequest: {
    status: string;
    requestedAt: string;
  } | null;
};

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "B";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatMemberSince(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function renderValue(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

export default async function ProfilePage() {
  const { requestOptions, session, shellProps } = await loadBuyerShellContext("/profile");
  const vipStatus = await api.buyer.vip.status<VipStatusResponse>(requestOptions).catch(() => ({
    tier: shellProps.tier,
    upgradeRequest: null,
  }));
  const accountStatus = session.userStatus.trim().toUpperCase() === "ACTIVE" ? "Active" : session.userStatus;
  const buyerTierLabel = vipStatus.tier === "VIP" ? "VIP · 4% commission" : "Standard · 2% commission";

  return (
    <BuyerShell
      activePage="profile"
      invoicesDue={shellProps.invoicesDue}
      companyName={shellProps.companyName}
      companyEmail={shellProps.companyEmail}
      tier={vipStatus.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Profile</h1>
          <p>Your company details and account settings.</p>
        </header>

        <ProfileVipBanner tier={vipStatus.tier} />

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.avatar}>{getInitials(shellProps.companyName)}</span>
            <div className={styles.headCopy}>
              <h2>{shellProps.companyName}</h2>
              <p>{shellProps.companyEmail}</p>
            </div>
          </div>

          <dl className={styles.fields}>
            <div className={styles.field}>
              <dt>Company name</dt>
              <dd>{renderValue(session.companyName)}</dd>
            </div>
            <div className={styles.field}>
              <dt>Trade licence</dt>
              <dd>{renderValue(session.companyRegistrationNumber)}</dd>
            </div>
            <div className={styles.field}>
              <dt>Contact phone</dt>
              <dd>{renderValue(session.companyPhone)}</dd>
            </div>
            <div className={styles.field}>
              <dt>Email</dt>
              <dd>{renderValue(session.email)}</dd>
            </div>
            <div className={styles.field}>
              <dt>Account status</dt>
              <dd>
                <span
                  className={[
                    styles.statusBadge,
                    session.userStatus.trim().toUpperCase() === "ACTIVE" ? styles.statusActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {accountStatus}
                </span>
              </dd>
            </div>
            <div className={styles.field}>
              <dt>Buyer tier</dt>
              <dd>{buyerTierLabel}</dd>
            </div>
            <div className={styles.field}>
              <dt>Member since</dt>
              <dd>{formatMemberSince(session.companyCreatedAt)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </BuyerShell>
  );
}
