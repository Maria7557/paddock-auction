"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";

import { getRole, getToken } from "@/src/lib/auth_client";

export default function AdminLayout({ children }: PropsWithChildren) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = getToken();
    const role = getRole();

    if (!token || role !== "ADMIN") {
      router.replace("/login");
      return;
    }

    setAuthorized(true);
  }, [router]);

  if (!authorized) {
    return null;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <h1>FleetBid Admin</h1>
        <nav>
          <ul>
            <li>
              <Link href="/admin">Dashboard</Link>
            </li>
            <li>
              <Link href="/admin#companies">Companies</Link>
            </li>
            <li>
              <Link href="/admin#users">Users</Link>
            </li>
            <li>
              <Link href="/admin#deposits">Deposits</Link>
            </li>
          </ul>
        </nav>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
