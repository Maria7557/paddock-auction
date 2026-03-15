"use client";

import { useState, type ReactNode } from "react";

import { NavigationGuardProvider } from "@/components/navigation/NavigationGuard";
import { SellerSidebar } from "@/components/seller/SellerSidebar";
import { SellerTopbar } from "@/components/seller/SellerTopbar";

type SellerShellProps = {
  companyName: string;
  companyStatus: string;
  children: ReactNode;
};

export function SellerShell({ companyName, companyStatus, children }: SellerShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const normalizedCompanyStatus = companyStatus.trim().toUpperCase();
  const isInactive = normalizedCompanyStatus !== "ACTIVE";
  const isPending =
    normalizedCompanyStatus === "PENDING_APPROVAL" || normalizedCompanyStatus === "PENDING";

  return (
    <NavigationGuardProvider>
      <div className="container seller-shell-wrap">
        <div className="seller-layout">
          <SellerSidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />

          <main className="seller-main">
            <SellerTopbar
              companyName={companyName}
              companyStatus={companyStatus}
              onToggleSidebar={() => setMobileOpen((previous) => !previous)}
            />
            {isInactive ? (
              <p className="inline-note tone-warning" style={{ marginBottom: "16px" }}>
                {isPending
                  ? "Company account pending admin approval. You can access the seller workspace now, but publishing and buyer-facing actions stay locked until approval."
                  : "This company account is not active right now. Publishing remains unavailable until the account is restored."}
              </p>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </NavigationGuardProvider>
  );
}
