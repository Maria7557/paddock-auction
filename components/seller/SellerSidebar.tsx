"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SellerSidebarProps = {
  mobileOpen: boolean;
  onNavigate?: () => void;
};

type NavItem = {
  href: string;
  label: string;
};

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/seller/dashboard", label: "Dashboard" },
  { href: "/seller/vehicles", label: "My Vehicles" },
  { href: "/seller/auctions", label: "Auctions" },
];

const SETTINGS_ITEMS: NavItem[] = [
  { href: "/seller/settings/company", label: "Company" },
  { href: "/seller/settings/team", label: "Team" },
  { href: "/seller/settings/documents", label: "Documents" },
  { href: "/seller/settings/notifications", label: "Notifications" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/seller/settings") {
    return pathname.startsWith("/seller/settings");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SellerSidebar({ mobileOpen, onNavigate }: SellerSidebarProps) {
  const pathname = usePathname();
  const className = ["seller-sidebar", mobileOpen ? "mobile-open" : ""].filter(Boolean).join(" ");

  return (
    <aside className={className} aria-label="Seller navigation">
      {PRIMARY_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`seller-nav-item ${isActive(pathname, item.href) ? "active" : ""}`}
          onClick={onNavigate}
        >
          {item.label}
        </Link>
      ))}

      <div className="seller-nav-divider" />
      <Link
        href="/seller/settings"
        className={`seller-nav-item ${pathname.startsWith("/seller/settings") ? "active" : ""}`}
        onClick={onNavigate}
      >
        Settings
      </Link>
      <div className="seller-nav-submenu">
        {SETTINGS_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`seller-nav-item seller-nav-item-sub ${isActive(pathname, item.href) ? "active" : ""}`}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
