import type { ReactNode } from "react";

import { SellerShell } from "@/components/seller/SellerShell";
import { requireSellerSession } from "@/src/lib/seller_session";

export const dynamic = "force-dynamic";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const session = await requireSellerSession("/seller/dashboard");

  return (
    <SellerShell companyName={session.companyName} companyStatus={session.companyStatus}>
      {children}
    </SellerShell>
  );
}
