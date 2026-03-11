"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "../layout.module.css";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/buyers", label: "Buyers" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map((item) => {
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
