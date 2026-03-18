"use client";

import Link from "next/link";
import type { ReactNode, SVGProps } from "react";

import { IconBuilding, IconFile, IconHeart, IconTag, IconUsers } from "@/components/ui/icons";
import { logout } from "@/src/lib/auth_client";

import styles from "./BuyerShell.module.css";

type BuyerShellProps = {
  activePage: "dashboard" | "my-bids" | "watchlist" | "wallet" | "invoices" | "profile";
  invoicesDue?: number;
  companyName: string;
  companyEmail: string;
  tier: "STANDARD" | "VIP";
  children: ReactNode;
};

type NavItem = {
  key: BuyerShellProps["activePage"];
  href: string;
  label: string;
  icon: ReactNode;
};

function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h10A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19h-10A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M16 12a1 1 0 1 0 0 .01" />
      <path d="M4.5 8.5h13.75a1.25 1.25 0 0 1 0 2.5H16.5" />
    </svg>
  );
}

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

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

const PRIMARY_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: <IconBuilding size={16} strokeWidth={2} />,
  },
  {
    key: "my-bids",
    href: "/my-bids",
    label: "My bids",
    icon: <IconTag size={16} strokeWidth={2} />,
  },
  {
    key: "watchlist",
    href: "/watchlist",
    label: "Watchlist",
    icon: <IconHeart size={16} strokeWidth={2} />,
  },
];

const SECONDARY_ITEMS: NavItem[] = [
  {
    key: "wallet",
    href: "/wallet",
    label: "Wallet",
    icon: <WalletIcon className={styles.svgIcon} />,
  },
  {
    key: "invoices",
    href: "/invoices",
    label: "Invoices",
    icon: <IconFile size={16} strokeWidth={2} />,
  },
];

const PROFILE_ITEM: NavItem = {
  key: "profile",
  href: "/profile",
  label: "Profile",
  icon: <IconUsers size={16} strokeWidth={2} />,
};

function NavLink({
  item,
  isActive,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className={styles.navLabel}>
        <span className={styles.iconWrap}>{item.icon}</span>
        <span>{item.label}</span>
      </span>
      {badge && badge > 0 ? <span className={styles.badge}>{badge}</span> : null}
    </Link>
  );
}

export function BuyerShell({
  activePage,
  invoicesDue = 0,
  companyName,
  companyEmail,
  tier,
  children,
}: BuyerShellProps) {
  const initials = getInitials(companyName);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Buyer navigation">
        <div className={styles.profileBlock}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.profileCopy}>
            <strong className={styles.companyName}>{companyName}</strong>
            <span className={styles.companyEmail}>{companyEmail}</span>
            <span
              className={`${styles.tierBadge} ${
                tier === "VIP" ? styles.tierBadgeVip : styles.tierBadgeStandard
              }`}
            >
              {tier === "VIP" ? "VIP" : "Standard buyer"}
            </span>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            {PRIMARY_ITEMS.map((item) => (
              <NavLink key={item.key} item={item} isActive={activePage === item.key} />
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.navGroup}>
            {SECONDARY_ITEMS.map((item) => (
              <NavLink
                key={item.key}
                item={item}
                isActive={activePage === item.key}
                badge={item.key === "invoices" ? invoicesDue : undefined}
              />
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.navGroup}>
            <NavLink item={PROFILE_ITEM} isActive={activePage === PROFILE_ITEM.key} />
          </div>
        </nav>

        <div className={styles.supportBlock}>
          <div className={styles.supportHeader}>
            <span className={styles.supportDot} />
            <span>Support · reply in 15 min</span>
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

        <button type="button" className={styles.signOutButton} onClick={logout}>
          Sign out
        </button>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
