"use client";

import { useState } from "react";

type ProfileLogoutButtonProps = {
  className?: string;
  label?: string;
  loadingLabel?: string;
};

export function ProfileLogoutButton({
  className,
  label = "Logout",
  loadingLabel = "Logging out...",
}: ProfileLogoutButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onLogout(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Continue local cleanup even if network call fails.
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem("fleetbid_token");
      window.localStorage.removeItem("fleetbid_role");
      document.cookie = "token=; Max-Age=0; Path=/; SameSite=Lax";
      window.location.href = "/login";
    }
  }

  return (
    <button type="button" className={className} onClick={() => void onLogout()} disabled={isSubmitting}>
      {isSubmitting ? loadingLabel : label}
    </button>
  );
}
