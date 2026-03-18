import Link from "next/link";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { IconTag } from "@/components/ui/icons";
import { api } from "@/src/lib/api-client";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type BuyerMyBidsResponse = {
  items: Array<{
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
  }>;
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

function formatCountdownLabel(startsAt: string | null, endsAt: string | null, status: string): string {
  const targetValue = status === "PAID" || status === "WON_PAYMENT_DUE" ? null : endsAt ?? startsAt;

  if (!targetValue) {
    return "Time unavailable";
  }

  const target = new Date(targetValue).getTime();
  const diffMs = target - Date.now();

  if (diffMs <= 0) {
    return "Closing soon";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }

  return `${Math.max(minutes, 1)}m left`;
}

function getStatusBadgeClass(status: BuyerMyBidsResponse["items"][number]["status"]): string {
  if (status === "WINNING" || status === "PAID") {
    return styles.statusSuccess;
  }

  return styles.statusDanger;
}

function getStatusLabel(status: BuyerMyBidsResponse["items"][number]["status"]): string {
  if (status === "WINNING") {
    return "Winning";
  }

  if (status === "OUTBID") {
    return "Outbid";
  }

  if (status === "WON_PAYMENT_DUE") {
    return "Won · payment due";
  }

  return "Paid";
}

export default async function MyBidsPage() {
  const session = await requireBuyerSession("/my-bids");
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [bidsResponse, dashboard, authResponse] = await Promise.all([
    api.buyer.myBids<BuyerMyBidsResponse>(requestOptions),
    api.buyer.dashboard<BuyerDashboardResponse>(requestOptions),
    api.auth.me<BuyerAuthResponse>(requestOptions),
  ]);

  const companyName = session.companyName?.trim() || "Buyer company";
  const companyEmail = authResponse.user?.email?.trim() || "buyer@fleetbid.ae";

  return (
    <BuyerShell
      activePage="my-bids"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={companyName}
      companyEmail={companyEmail}
      tier={dashboard.vipStatus.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>My bids</h1>
          <p>Follow your winning and outbid positions in real time</p>
        </header>

        {bidsResponse.items.length === 0 ? (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <IconTag size={24} strokeWidth={2} />
            </span>
            <h2>No bids yet</h2>
            <p>Browse live auctions to place your first bid.</p>
            <Link href="/auctions" className="btn btn-primary">
              Browse auctions
            </Link>
          </section>
        ) : (
          <div className={styles.list}>
            {bidsResponse.items.map((item) => (
              <article key={item.auctionId} className={styles.card}>
                <div className={styles.infoCol}>
                  <span className={styles.lotNumber}>{item.lotNumber}</span>
                  <h2 className={styles.lotTitle}>{item.lotTitle}</h2>

                  <div className={styles.metaRow}>
                    <span className={`${styles.statusTag} ${getStatusBadgeClass(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                    <span className={styles.metaText}>
                      {item.city} · {formatCountdownLabel(item.startsAt, item.endsAt, item.status)}
                    </span>
                  </div>

                  {item.status === "OUTBID" ? (
                    <p className={styles.supportingMeta}>
                      Current price {formatAed(item.currentBid)}
                    </p>
                  ) : null}
                </div>

                <div className={styles.actionCol}>
                  <div className={styles.amountBlock}>
                    <strong
                      className={`${styles.amountValue} ${
                        item.status === "OUTBID" || item.status === "WON_PAYMENT_DUE"
                          ? styles.amountDanger
                          : ""
                      }`}
                    >
                      {formatAed(item.myBid)}
                    </strong>
                    <span className={styles.amountLabel}>
                      {item.status === "WINNING"
                        ? "your bid · highest"
                        : item.status === "OUTBID"
                          ? "your last bid"
                          : item.status === "WON_PAYMENT_DUE"
                            ? "invoice amount due"
                            : "payment completed"}
                    </span>
                  </div>

                  <div className={styles.actions}>
                    {item.status === "OUTBID" ? (
                      <>
                        <Link href={`/auctions/${item.auctionId}`} className="btn btn-primary">
                          Bid again
                        </Link>
                        <Link href={`/auctions/${item.auctionId}`} className="btn btn-outline">
                          Open lot
                        </Link>
                      </>
                    ) : null}

                    {item.status === "WINNING" ? (
                      <Link href={`/auctions/${item.auctionId}`} className="btn btn-outline">
                        Open lot
                      </Link>
                    ) : null}

                    {item.status === "WON_PAYMENT_DUE" ? (
                      <Link
                        href={item.invoiceId ? `/invoices#${item.invoiceId}` : "/invoices"}
                        className="btn btn-primary"
                      >
                        Pay invoice
                      </Link>
                    ) : null}

                    {item.status === "PAID" ? (
                      <Link
                        href={item.invoiceId ? `/invoices#${item.invoiceId}` : "/invoices"}
                        className="btn btn-outline"
                      >
                        Download PDF
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </BuyerShell>
  );
}
