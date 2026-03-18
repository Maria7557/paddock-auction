import Link from "next/link";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { loadBuyerShellContext } from "@/src/lib/buyer_cabinet";
import { api } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type BuyerBidItem = {
  auctionId: string;
  lotNumber: string;
  lotTitle: string;
  city: string;
  startsAt: string | null;
  endsAt: string | null;
  currentBid: number;
  myBid: number;
  status: "WINNING" | "OUTBID" | "WON_PAYMENT_DUE" | "PAID";
  invoiceId: string | null;
};

type BuyerMyBidsResponse = {
  items: BuyerBidItem[];
};

function formatMeta(item: BuyerBidItem): string {
  const timeValue = item.status === "WON_PAYMENT_DUE" || item.status === "PAID" ? item.startsAt : item.endsAt;

  if (!timeValue) {
    return item.city;
  }

  const label = new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timeValue));

  if (item.status === "WON_PAYMENT_DUE" || item.status === "PAID") {
    return `${item.city} · Auction ${label}`;
  }

  return `${item.city} · Ends ${label}`;
}

function StatusTags({ status }: { status: BuyerBidItem["status"] }) {
  if (status === "WINNING") {
    return (
      <div className={styles.tags}>
        <span className={`${styles.tag} ${styles.tagLive}`}>LIVE</span>
        <span className={`${styles.tag} ${styles.tagWinning}`}>Winning</span>
      </div>
    );
  }

  if (status === "OUTBID") {
    return (
      <div className={styles.tags}>
        <span className={`${styles.tag} ${styles.tagLive}`}>LIVE</span>
        <span className={`${styles.tag} ${styles.tagOutbid}`}>Outbid</span>
      </div>
    );
  }

  if (status === "WON_PAYMENT_DUE") {
    return (
      <div className={styles.tags}>
        <span className={`${styles.tag} ${styles.tagOutbid}`}>Won · payment due</span>
      </div>
    );
  }

  return (
    <div className={styles.tags}>
      <span className={`${styles.tag} ${styles.tagWinning}`}>Paid</span>
    </div>
  );
}

function BidActions({ item }: { item: BuyerBidItem }) {
  if (item.status === "WINNING") {
    return (
      <div className={styles.actions}>
        <Link href={`/auctions/${item.auctionId}`} className={styles.secondaryButton}>
          Open lot
        </Link>
      </div>
    );
  }

  if (item.status === "OUTBID") {
    return (
      <div className={styles.actions}>
        <Link href={`/auctions/${item.auctionId}`} className={styles.primaryButton}>
          Bid again
        </Link>
        <Link href={`/auctions/${item.auctionId}`} className={styles.secondaryButton}>
          Open lot
        </Link>
      </div>
    );
  }

  if (item.status === "WON_PAYMENT_DUE" && item.invoiceId) {
    return (
      <div className={styles.actions}>
        <Link href={`/finance/invoices/${item.invoiceId}`} className={styles.secondaryButton}>
          View invoice
        </Link>
        <Link href={`/finance/invoices/${item.invoiceId}`} className={styles.primaryButton}>
          Pay now
        </Link>
      </div>
    );
  }

  if (item.invoiceId) {
    return (
      <div className={styles.actions}>
        <Link href={`/finance/invoices/${item.invoiceId}`} className={styles.secondaryButton}>
          Download PDF
        </Link>
      </div>
    );
  }

  return null;
}

export default async function MyBidsPage() {
  const { requestOptions, shellProps } = await loadBuyerShellContext("/my-bids");
  const response = await api.buyer.myBids<BuyerMyBidsResponse>(requestOptions).catch(() => ({
    items: [],
  }));

  return (
    <BuyerShell
      activePage="my-bids"
      invoicesDue={shellProps.invoicesDue}
      companyName={shellProps.companyName}
      companyEmail={shellProps.companyEmail}
      tier={shellProps.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>My bids</h1>
          <p>Follow your winning and outbid positions in real time.</p>
        </header>

        {response.items.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>No bids yet</h2>
            <p>When you place your first bid, it will appear here with its latest status.</p>
            <Link href="/auctions" className={styles.primaryButton}>
              Browse auctions
            </Link>
          </section>
        ) : (
          <div className={styles.list}>
            {response.items.map((item) => (
              <article key={item.auctionId} className={styles.card}>
                <div className={styles.cardLeft}>
                  <span className={styles.lotNumber}>{item.lotNumber}</span>
                  <h2>{item.lotTitle}</h2>
                  <StatusTags status={item.status} />
                  <p className={styles.meta}>{formatMeta(item)}</p>
                </div>

                <div className={styles.cardRight}>
                  <div className={styles.amountBlock}>
                    <span>{item.status === "PAID" ? "Paid amount" : "Your latest bid"}</span>
                    <strong>{formatAed(item.status === "PAID" ? item.currentBid : item.myBid)}</strong>
                  </div>
                  <BidActions item={item} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </BuyerShell>
  );
}
