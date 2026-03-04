"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

type NavLink = {
  href: string;
  label: string;
};

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/auctions", label: "Auctions" },
  { href: "/finance", label: "Finance" },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell">
        <header className="app-nav" aria-label="Main navigation">
          <div className="app-nav-row">
            <Link href="/" className="brand-lockup">
              <span className="brand-eyebrow">Paddock</span>
              <span className="brand-title">Auction Control</span>
            </Link>

            <nav className="app-nav-links" aria-label="Primary">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={isLinkActive(pathname, link.href) ? "is-active" : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="app-nav-meta">
            <p>Controlled MVP: deposit-gated bids, idempotent commands, 48h payment enforcement.</p>
            <a href="/api/health" target="_blank" rel="noreferrer">
              API Health
            </a>
          </div>
        </header>

        <main id="main-content" className="app-content">
          {children}
        </main>
      </div>
    </>
  );
}
