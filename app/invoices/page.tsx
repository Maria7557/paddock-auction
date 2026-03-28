import Link from "next/link";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { IconFile } from "@/components/ui/icons";
import { api, buildApiUrl } from "@/src/lib/api-client";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { withServerCookies } from "@/src/lib/server-api-options";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

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

type FinanceInvoicesResponse = {
  invoices: Array<{
    id: string;
    invoiceId: string;
    auctionId: string;
    lotNumber: string;
    lotTitle: string;
    total: number;
    status: string;
    issuedAt: string;
    dueAt: string;
  }>;
};

type InvoiceTone = "overdue" | "pending" | "paid";

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getInvoiceTone(status: string, dueAt: string): InvoiceTone {
  if (status === "PAID") {
    return "paid";
  }

  if (status === "DEFAULTED" || new Date(dueAt).getTime() < Date.now()) {
    return "overdue";
  }

  return "pending";
}

function getStatusLabel(tone: InvoiceTone): string {
  if (tone === "paid") {
    return "Paid";
  }

  if (tone === "overdue") {
    return "Deadline exceeded";
  }

  return "Payment pending";
}

export default async function InvoicesPage() {
  const session = await requireBuyerSession("/invoices");
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [invoicesResponse, dashboard, authResponse] = await Promise.all([
    api.finance.invoices.list<FinanceInvoicesResponse>(requestOptions),
    api.buyer.dashboard<BuyerDashboardResponse>(requestOptions),
    api.auth.me<BuyerAuthResponse>(requestOptions),
  ]);

  const companyName = session.companyName?.trim() || "Buyer company";
  const companyEmail = authResponse.user?.email?.trim() || "buyer@fleetbid.ae";
  const allPaid =
    invoicesResponse.invoices.length > 0 &&
    invoicesResponse.invoices.every((invoice) => getInvoiceTone(invoice.status, invoice.dueAt) === "paid");

  return (
    <BuyerShell
      activePage="invoices"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={companyName}
      companyEmail={companyEmail}
      tier={dashboard.vipStatus.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Invoices</h1>
          <p>Pay within 48 hours of winning to avoid deposit loss</p>
        </header>

        {allPaid ? (
          <section className={styles.successBanner}>
            All invoices paid — no outstanding payments
          </section>
        ) : null}

        {invoicesResponse.invoices.length === 0 ? (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <IconFile size={24} strokeWidth={2} />
            </span>
            <h2>No invoices yet</h2>
            <p>Your winning payments will appear here as soon as they are issued.</p>
          </section>
        ) : (
          <div className={styles.list}>
            {invoicesResponse.invoices.map((invoice) => {
              const tone = getInvoiceTone(invoice.status, invoice.dueAt);

              return (
                <article
                  key={invoice.id}
                  className={`${styles.card} ${
                    tone === "overdue"
                      ? styles.cardOverdue
                      : tone === "pending"
                        ? styles.cardPending
                        : styles.cardPaid
                  }`}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardInfo}>
                      <span className={styles.lotNumber}>{invoice.lotNumber}</span>
                      <h2>{invoice.lotTitle}</h2>
                      <p>Invoice ID {invoice.invoiceId}</p>
                    </div>

                    <div className={styles.cardAmount}>
                      <strong>{formatAed(invoice.total)}</strong>
                      <span>Due {formatDateLabel(invoice.dueAt)}</span>
                    </div>
                  </div>

                  <div className={styles.cardBottom}>
                    <span
                      className={`${styles.statusTag} ${
                        tone === "overdue"
                          ? styles.statusOverdue
                          : tone === "pending"
                            ? styles.statusPending
                            : styles.statusPaid
                      }`}
                    >
                      {getStatusLabel(tone)}
                    </span>

                    <div className={styles.actions}>
                      {tone === "paid" ? (
                        <a
                          href={buildApiUrl(`/api/finance/invoices/${invoice.id}/pdf`)}
                          className="btn btn-outline"
                        >
                          Download PDF
                        </a>
                      ) : (
                        <>
                          <Link href={`/invoices/${invoice.id}`} className="btn btn-outline">
                            View invoice
                          </Link>
                          <Link href={`/invoices/${invoice.id}`} className="btn btn-primary">
                            Pay now
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </BuyerShell>
  );
}
