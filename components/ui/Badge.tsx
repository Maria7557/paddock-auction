import type { ReactNode } from "react";

export type BadgeTone = "live" | "scheduled" | "payment_pending" | "defaulted" | "ended";

export type BadgeProps = {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
};

export function Badge({ tone = "ended", className, children }: BadgeProps) {
  const classes = ["status-badge", `status-${tone}`, className].filter(Boolean).join(" ");

  return <span className={classes}>{children}</span>;
}

export function getBadgeToneFromStatus(status: string): BadgeTone {
  const normalized = status.toUpperCase();

  if (normalized === "LIVE") {
    return "live";
  }

  if (normalized === "SCHEDULED") {
    return "scheduled";
  }

  if (normalized === "PAYMENT_PENDING") {
    return "payment_pending";
  }

  if (normalized === "DEFAULTED") {
    return "defaulted";
  }

  return "ended";
}
