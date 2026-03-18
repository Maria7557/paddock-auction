import { api } from "@/src/lib/api-client";
import { requireBuyerSession, type BuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";

type BuyerShellSummaryResponse = {
  metrics?: {
    invoicesDue?: number;
  };
  vipStatus?: {
    tier?: "STANDARD" | "VIP";
  };
};

export type BuyerShellContext = {
  requestOptions: RequestInit;
  session: BuyerSession;
  shellProps: {
    companyName: string;
    companyEmail: string;
    tier: "STANDARD" | "VIP";
    invoicesDue: number;
  };
};

export async function loadBuyerShellContext(nextPath: string): Promise<BuyerShellContext> {
  const session = await requireBuyerSession(nextPath);
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const dashboardSummary = await api.buyer
    .dashboard<BuyerShellSummaryResponse>(requestOptions)
    .catch(() => null);

  return {
    requestOptions,
    session,
    shellProps: {
      companyName: session.companyName ?? "Buyer account",
      companyEmail: session.email,
      tier: dashboardSummary?.vipStatus?.tier === "VIP" ? "VIP" : session.buyerTier,
      invoicesDue: Number(dashboardSummary?.metrics?.invoicesDue ?? 0),
    },
  };
}
