import { notFound } from "next/navigation";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { InvoicePaymentActions } from "@/components/buyer/InvoicePaymentActions";
import { ApiError, api } from "@/src/lib/api-client";
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

type InvoiceDetailResponse = {
  invoice: {
    id: string;
    invoiceId: string;
    auctionId: string;
    lotNumber: string;
    lotTitle: string;
    winningBid: number;
    commission: number;
    vat: number;
    docFee: number;
    total: number;
    status: string;
    issuedAt: string;
    dueAt: string;
  };
};

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getStatusTone(status: string, dueAt: string): "paid" | "pending" | "overdue" {
  if (status === "PAID") {
    return "paid";
  }

  if (status === "DEFAULTED" || new Date(dueAt).getTime() < Date.now()) {
    return "overdue";
  }

  return "pending";
}

function getStatusLabel(tone: "paid" | "pending" | "overdue"): string {
  if (tone === "paid") {
    return "Paid";
  }

  if (tone === "overdue") {
    return "Deadline exceeded";
  }

  return "Payment pending";
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = await params;
  const session = await requireBuyerSession(`/invoices/${resolvedParams.id}`);
  const requestOptions = await withServerCookies({ cache: "no-store" });

  const [dashboard, authResponse, invoiceResponse] = await Promise.all([
    api.buyer.dashboard<BuyerDashboardResponse>(requestOptions),
    api.auth.me<BuyerAuthResponse>(requestOptions),
    api.finance.invoices
      .get<InvoiceDetailResponse>(resolvedParams.id, requestOptions)
      .catch((error) => {
        if (error instanceof ApiError && error.statusCode === 404) {
          return null;
        }

        throw error;
      }),
  ]);

  if (!invoiceResponse) {
    notFound();
  }

  const companyName = session.companyName?.trim() || "Buyer company";
  const companyEmail = authResponse.user?.email?.trim() || "buyer@fleetbid.ae";
  const tone = getStatusTone(invoiceResponse.invoice.status, invoiceResponse.invoice.dueAt);

  return (
    <BuyerShell
      activePage="invoices"
      invoicesDue={dashboard.metrics.invoicesDue}
      companyName={companyName}
      companyEmail={companyEmail}
      tier={dashboard.vipStatus.tier}
    >
      <div className={styles.page}>
        <section className={styles.headerCard}>
          <div className={styles.headerCopy}>
            <span className={styles.lotNumber}>{invoiceResponse.invoice.lotNumber}</span>
            <h1>{invoiceResponse.invoice.lotTitle}</h1>
            <p>Invoice ID {invoiceResponse.invoice.invoiceId}</p>
          </div>

          <div className={styles.headerMeta}>
            <span
              className={`${styles.statusTag} ${
                tone === "paid"
                  ? styles.statusPaid
                  : tone === "overdue"
                    ? styles.statusOverdue
                    : styles.statusPending
              }`}
            >
              {getStatusLabel(tone)}
            </span>
            <span className={styles.dueDate}>Due {formatDateLabel(invoiceResponse.invoice.dueAt)}</span>
          </div>
        </section>

        <section className={styles.breakdownCard}>
          <div className={styles.sectionTitle}>Invoice breakdown</div>

          <div className={styles.breakdownRow}>
            <span>Vehicle purchase</span>
            <strong>{formatAed(invoiceResponse.invoice.winningBid)}</strong>
          </div>
          <div className={styles.breakdownRow}>
            <span>Buyer commission</span>
            <strong>{formatAed(invoiceResponse.invoice.commission)}</strong>
          </div>
          <div className={styles.breakdownRow}>
            <span>VAT (5%)</span>
            <strong>{formatAed(invoiceResponse.invoice.vat)}</strong>
          </div>
          <div className={styles.breakdownRow}>
            <span>Document processing</span>
            <strong>{formatAed(invoiceResponse.invoice.docFee)}</strong>
          </div>

          <div className={`${styles.breakdownRow} ${styles.totalRow}`}>
            <span>Total due</span>
            <strong>{formatAed(invoiceResponse.invoice.total)}</strong>
          </div>
        </section>

        <section className={styles.actionsCard}>
          <InvoicePaymentActions
            invoiceId={invoiceResponse.invoice.id}
            total={invoiceResponse.invoice.total}
            status={invoiceResponse.invoice.status}
          />
        </section>
      </div>
    </BuyerShell>
  );
}
