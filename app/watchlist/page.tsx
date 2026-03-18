import { BuyerShell } from "@/components/buyer/BuyerShell";
import { LotCard } from "@/components/auction/LotCard";
import { loadBuyerShellContext } from "@/src/lib/buyer_cabinet";
import { api } from "@/src/lib/api-client";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type WatchlistLot = {
  id: string;
  state: string;
  currentPrice: number;
  buyNowPrice: number | null;
  startsAt: string | null;
  endsAt: string | null;
  totalBids: number;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    mileage: number;
    marketPrice: number | null;
    regionSpec: string | null;
    images: string[];
  };
};

type WatchlistResponse = {
  lots: WatchlistLot[];
  nextCursor: string | null;
};

function buildLotTitle(lot: WatchlistLot): string {
  return [lot.vehicle.brand, lot.vehicle.model, lot.vehicle.year]
    .filter((value) => value !== null && value !== undefined && String(value).trim().length > 0)
    .join(" ");
}

function resolveLotImage(lot: WatchlistLot): string {
  return lot.vehicle.images[0] ?? "/vehicle-photo.svg";
}

function resolveLotTime(lot: WatchlistLot): string {
  return lot.endsAt ?? lot.startsAt ?? new Date().toISOString();
}

export default async function WatchlistPage() {
  const { requestOptions, shellProps } = await loadBuyerShellContext("/watchlist");
  const response = await api.buyer.wishlist.list<WatchlistResponse>(undefined, requestOptions).catch(() => ({
    lots: [],
    nextCursor: null,
  }));

  return (
    <BuyerShell
      activePage="watchlist"
      invoicesDue={shellProps.invoicesDue}
      companyName={shellProps.companyName}
      companyEmail={shellProps.companyEmail}
      tier={shellProps.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Watchlist</h1>
          <p>Saved lots stay here so you can reopen them quickly before the auction starts.</p>
        </header>

        {response.lots.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>Your watchlist is empty</h2>
            <p>Save interesting lots and they will appear here for quick access.</p>
            <a href="/auctions" className={styles.primaryButton}>
              Browse auctions
            </a>
          </section>
        ) : (
          <section className={styles.grid}>
            {response.lots.map((lot) => (
              <LotCard
                key={lot.id}
                lotId={lot.id}
                title={buildLotTitle(lot)}
                year={lot.vehicle.year}
                mileage={lot.vehicle.mileage}
                regionSpec={lot.vehicle.regionSpec ?? undefined}
                imageUrl={resolveLotImage(lot)}
                currentBid={lot.currentPrice}
                buyNowPrice={lot.buyNowPrice ?? undefined}
                status={lot.state}
                totalBids={lot.totalBids}
                endTime={resolveLotTime(lot)}
                marketPrice={lot.vehicle.marketPrice ?? undefined}
              />
            ))}
          </section>
        )}
      </div>
    </BuyerShell>
  );
}
