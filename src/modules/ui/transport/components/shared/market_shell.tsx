"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { TopUtilityBar } from "@/components/layout/TopUtilityBar";

import styles from "./market_shell.module.css";

type MarketShellProps = {
  children: ReactNode;
  hideHeader?: boolean;
  shellClassName?: string;
  mainClassName?: string;
};

type NavItem = {
  href: string;
  label: string;
};

const CENTER_NAV: NavItem[] = [
  { href: "/auctions", label: "Auctions" },
  { href: "/auctions#schedule", label: "View Schedule" },
  { href: "/#how-it-works", label: "How It Works" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MarketShell({
  children,
  hideHeader = false,
  shellClassName,
  mainClassName,
}: MarketShellProps) {
  const pathname = usePathname();
  const shellClasses = ["market-shell", shellClassName].filter(Boolean).join(" ");
  const mainClasses = ["market-main", mainClassName].filter(Boolean).join(" ");

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <div className={shellClasses}>
        {!hideHeader ? (
          <>
            <TopUtilityBar />

            <header className="market-header">
              <div className="market-header-row">
                <Link href="/" className="brand-link" aria-label="Paddock Auction home">
                  <span className="brand-name">FleetBid</span>
                </Link>

                <nav className="market-nav market-nav-center" aria-label="Primary navigation">
                  <div className={styles.dropdown}>
                    <button type="button" className={styles.dropdownTrigger} aria-haspopup="menu">
                      <span>Vehicles</span>
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    <div className={styles.dropdownPanel} role="menu">
                      Vehicle categories
                    </div>
                  </div>
                  {CENTER_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={isActive(pathname, item.href) ? "is-active" : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="header-right">
                  <Link href="/login" className="auth-link">
                    Login
                  </Link>

                  <Link href="/register" className="button button-primary">
                    Register Company
                  </Link>
                </div>
              </div>
            </header>
          </>
        ) : null}

        <main id="main-content" className={mainClasses}>
          {children}
        </main>
      </div>
    </>
  );
}
