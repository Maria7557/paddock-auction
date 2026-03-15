import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileLogoutButton } from "@/components/shell/ProfileLogoutButton";
import { api } from "@/src/lib/api-client";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { withServerCookies } from "@/src/lib/server-api-options";

import { getAdminCopy } from "./i18n";
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

  const locale = await getLocalePreference();
  const t = getAdminCopy(locale);
  const logoutLabel = locale === "ru" ? "Выйти" : "Logout";
  const loggingOutLabel = locale === "ru" ? "Выход..." : "Logging out...";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label={t.navAriaLabel}>
        <div className={styles.brand}>{t.brand}</div>
        <AdminNav locale={locale} />
        <div className={styles.sidebarFooter}>
          <ProfileLogoutButton
            className={styles.logoutBtn}
            label={logoutLabel}
            loadingLabel={loggingOutLabel}
          />
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
