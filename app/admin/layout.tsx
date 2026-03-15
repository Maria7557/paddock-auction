import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { AdminNav } from "./components/AdminNav";
import styles from "./layout.module.css";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value?.trim();

  if (!token) {
    redirect("/login");
  }

  const session = await api.auth.me<{
    user?: {
      role?: string;
    };
  }>(await withServerCookies({ cache: "no-store" })).catch(() => null);

  if (session?.user?.role !== "ADMIN") {
    redirect("/login");
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Admin navigation">
        <div className={styles.brand}>FleetBid Admin</div>
        <AdminNav />
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
