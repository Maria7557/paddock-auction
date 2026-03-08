"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";

type JwtClaims = {
  role?: string;
  email?: string;
  sub?: string;
};

type AuthState = "checking" | "authorized" | "rejected";

function decodeJwtClaims(token: string): JwtClaims | null {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payloadText = window.atob(normalized);
    const payload = JSON.parse(payloadText) as JwtClaims;
    return payload;
  } catch {
    return null;
  }
}

export default function AdminLayout({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    const token = window.localStorage.getItem("fleetbid_token");

    if (!token) {
      setAuthState("rejected");
      router.replace("/login");
      return;
    }

    const claims = decodeJwtClaims(token);

    if (!claims || claims.role !== "ADMIN") {
      setAuthState("rejected");
      router.replace("/login");
      return;
    }

    setAuthState("authorized");
  }, [router]);

  const navItems = useMemo(
    () => [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin#companies", label: "Companies" },
      { href: "/admin#users", label: "Users" },
      { href: "/admin#deposits", label: "Deposits" },
    ],
    [],
  );

  if (authState !== "authorized") {
    return (
      <div className="admin-auth-guard">
        <p>Checking admin access...</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <h1>FleetBid Admin</h1>
        <nav>
          <ul>
            {navItems.map((item) => {
              const isActive = item.href === "/admin" ? pathname === "/admin" : false;

              return (
                <li key={item.href}>
                  <Link href={item.href} className={isActive ? "is-active" : undefined}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
