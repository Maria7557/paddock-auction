import type { ReactNode } from "react";

import { TabPill } from "@/components/seller/TabPill";

export default function SellerSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <section className="seller-section-stack">
      <section className="surface-panel seller-section-block">
        <div className="seller-tabs">
          <TabPill href="/seller/settings/company" label="Company" />
          <TabPill href="/seller/settings/team" label="Team" />
          <TabPill href="/seller/settings/documents" label="Documents" />
          <TabPill href="/seller/settings/notifications" label="Notifications" />
        </div>
      </section>

      {children}
    </section>
  );
}
