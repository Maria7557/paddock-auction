import Link from "next/link";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { WatchlistGrid } from "@/components/buyer/WatchlistGrid";
import { api } from "@/src/lib/api-client";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type BuyerWatchlistResponse = {
  lots: Array<{
    id: string;
    state: string;
    currentPrice: number;
    buyNowPrice: number | null;
    startsAt: string | null;
    endsAt: string | null;
    location: string;
    isWatchlisted: boolean;
    vehicle: {
      brand: string;
      model: string;
      year: number;
      mileage: number;
      regionSpec: string | null;
      images: string[];
    };
  }>;
  nextCursor: string | null;
};

type BuyerDashboardResponse = {
  metrics: {
    invoicesDue: number;
  };
  vipStatus: {
    tier: "STANDARD" | "VIP";
  };
};

type BuyerAuthResponse = {
  user?: {
    email?: string;
  };
};

export default async function WatchlistPage() {
  const session = await requireBuyerSession("/watchlist");
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [watchlistResponse, dashboard, authResponse] = await Promise.all([
    api.buyer.wishlist.list<BuyerWatchlistResponse>(undefined, requestOptions),
    api.buyer.dashboard<BuyerDashboardResponse>(requestOptions),
    api.auth.me<BuyerAuthResponse>(requestOptions),
  ]);

  const companyName = session.companyName?.trim() || "Buyer company";
  const companyEmail = authResponse.user?.email?.trim() || "buyer@fleetbid.ae";

  return (
    <BuyerShell
      activePage="watchlist"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={companyName}
      companyEmail={companyEmail}
      tier={dashboard.vipStatus.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.copy}>
            <h1>Watchlist</h1>
            <p>Vehicles you saved — {watchlistResponse.lots.length} lots</p>
          </div>
          <Link href="/auctions" className={styles.browseLink}>
            Browse auctions →
          </Link>
        </header>

        <WatchlistGrid initialLots={watchlistResponse.lots} />
      </div>
    </BuyerShell>
  );
}
