"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabPillProps = {
  href: string;
  label: string;
  variant?: "default" | "primary";
};

export function TabPill({ href, label, variant = "default" }: TabPillProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  const classNames = [
    "seller-tab",
    variant === "primary" ? "primary" : "",
    isActive && variant === "default" ? "active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={href} className={classNames} aria-current={isActive ? "page" : undefined}>
      {label}
    </Link>
  );
}
