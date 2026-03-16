"use client";

import { usePathname } from "next/navigation";

import { GuardedLink } from "@/components/navigation/NavigationGuard";

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
    <GuardedLink href={href} className={classNames} aria-current={isActive ? "page" : undefined}>
      {label}
    </GuardedLink>
  );
}
