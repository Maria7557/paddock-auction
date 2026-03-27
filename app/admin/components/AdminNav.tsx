"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SupportedLocale } from "@/src/i18n/routing";

import { getAdminCopy } from "../i18n";
import styles from "../layout.module.css";

type NavItem = {
  href: string;
  label: string;
};

type AdminNavProps = {
  locale: SupportedLocale;
};

export function AdminNav({ locale }: AdminNavProps) {
  const pathname = usePathname() ?? "";
  const t = getAdminCopy(locale);
  const navItems: NavItem[] = [
    { href: "/admin/companies", label: t.nav.companies },
    { href: "/admin/vehicles", label: t.nav.vehicles },
    { href: "/admin/events", label: t.nav.events },
    { href: "/admin/buyers", label: t.nav.buyers },
    { href: "/admin/invoices", label: t.nav.invoices },
  ];

  return (
    <nav className={styles.nav} aria-label={t.navAriaLabel}>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`.trim()}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
