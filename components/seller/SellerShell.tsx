"use client";

import { useState, type ReactNode } from "react";

import { SellerSidebar } from "@/components/seller/SellerSidebar";
import { SellerTopbar } from "@/components/seller/SellerTopbar";

type SellerShellProps = {
  companyName: string;
  companyStatus: string;
  children: ReactNode;
};

export function SellerShell({ companyName, companyStatus, children }: SellerShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="container seller-shell-wrap">
      <div className="seller-layout">
        <SellerSidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />

        <main className="seller-main">
          <SellerTopbar
            companyName={companyName}
            companyStatus={companyStatus}
            onToggleSidebar={() => setMobileOpen((previous) => !previous)}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
