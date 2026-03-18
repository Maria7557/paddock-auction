"use client";

import { useMemo, useState, type ReactNode } from "react";

import { GuardedLink, NavigationGuardProvider, useConfirmNavigation } from "@/components/navigation/NavigationGuard";
import {
  IconFile,
  IconHeart,
  IconShield,
  IconTag,
  IconUsers,
  IconZap,
} from "@/components/ui/icons";
import { api } from "@/src/lib/api-client";
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
  id: BuyerShellProps["activePage"];
  href: string;
  label: string;
  icon: typeof IconZap;
  badge?: number;
};

const PRIMARY_NAV: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: IconZap },
  { id: "my-bids", href: "/my-bids", label: "My bids", icon: IconTag },
  { id: "watchlist", href: "/watchlist", label: "Watchlist", icon: IconHeart },
];

const SECONDARY_NAV: NavItem[] = [
  { id: "wallet", href: "/wallet", label: "Wallet", icon: IconShield },
  { id: "invoices", href: "/invoices", label: "Invoices", icon: IconFile },
];

const PROFILE_NAV: NavItem[] = [
  { id: "profile", href: "/profile", label: "Profile", icon: IconUsers },
];

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

function NavSection({
  items,
  activePage,
  onNavigate,
}: {
  items: NavItem[];
  activePage: BuyerShellProps["activePage"];
  onNavigate?: () => void;
}) {
  return (
    <div className={styles.navSection}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activePage;

        return (
          <GuardedLink
            key={item.id}
            href={item.href}
            className={[styles.navItem, isActive ? styles.navItemActive : ""].filter(Boolean).join(" ")}
            onClick={onNavigate}
          >
            <span className={styles.navItemLeft}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </span>
            {item.badge && item.badge > 0 ? <span className={styles.badge}>{item.badge}</span> : null}
          </GuardedLink>
        );
      })}
    </div>
  );
}

function ShellBody({
  activePage,
  invoicesDue = 0,
  companyName,
  companyEmail,
  tier,
  children,
}: BuyerShellProps) {
  const confirmNavigation = useConfirmNavigation();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const initials = useMemo(() => getInitials(companyName), [companyName]);
  const secondaryNav = useMemo(
    () =>
      SECONDARY_NAV.map((item) =>
        item.id === "invoices"
          ? {
              ...item,
              badge: invoicesDue,
            }
          : item,
      ),
    [invoicesDue],
  );

  async function signOut(): Promise<void> {
    if (isSigningOut) {
      return;
    }

    if (!confirmNavigation()) {
      return;
    }

    setIsSigningOut(true);

    try {
      await api.auth.logout();
    } catch {
      // Continue local sign out when the backend request fails.
    }

    logout();
  }

  return (
    <div className={styles.frame}>
      <aside className={styles.sidebar} aria-label="Buyer navigation">
        <div className={styles.identity}>
          <span className={styles.avatar}>{initials}</span>
          <div className={styles.identityCopy}>
            <strong>{companyName}</strong>
            <span>{companyEmail}</span>
          </div>
          <span className={tier === "VIP" ? styles.tierVip : styles.tierStandard}>
            {tier === "VIP" ? "#VIP" : "Standard buyer"}
          </span>
        </div>

        <NavSection items={PRIMARY_NAV} activePage={activePage} />
        <div className={styles.divider} />
        <NavSection items={secondaryNav} activePage={activePage} />
        <div className={styles.divider} />
        <NavSection items={PROFILE_NAV} activePage={activePage} />

        <div className={styles.supportCard}>
          <div className={styles.supportHeader}>
            <span className={styles.supportDot} aria-hidden="true" />
            <strong>Support · reply in 15 min</strong>
          </div>
          <div className={styles.supportActions}>
            <a
              className={`${styles.supportButton} ${styles.whatsAppButton}`}
              href="https://wa.me/971500000000"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <a
              className={`${styles.supportButton} ${styles.telegramButton}`}
              href="https://t.me/fleetbid"
              target="_blank"
              rel="noreferrer"
            >
              Telegram
            </a>
          </div>
        </div>

        <button
          type="button"
          className={styles.signOut}
          onClick={() => void signOut()}
          disabled={isSigningOut}
        >
          {isSigningOut ? "Signing out..." : "Sign out"}
        </button>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}

export function BuyerShell(props: BuyerShellProps) {
  return (
    <NavigationGuardProvider>
      <ShellBody {...props} />
    </NavigationGuardProvider>
  );
}
