import Link from "next/link";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { loadBuyerShellContext } from "@/src/lib/buyer_cabinet";
import { api } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type InvoiceItem = {
  id: string;
  auctionId: string;
  lotNumber: string;
  lotTitle: string;
  amount: number;
  dueAt: string;
  issuedAt: string;
  status: "OVERDUE" | "PENDING" | "PAID";
};

type InvoiceListResponse = {
  invoices: InvoiceItem[];
};

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function resolveStatusLabel(status: InvoiceItem["status"]): string {
  if (status === "OVERDUE") {
    return "Deadline exceeded";
  }

  if (status === "PAID") {
    return "Paid";
  }

  return "Payment pending";
}

function resolveCardClass(status: InvoiceItem["status"]): string {
  if (status === "OVERDUE") {
    return styles.cardOverdue;
  }

  if (status === "PENDING") {
    return styles.cardPending;
  }

  return styles.cardPaid;
}

function resolveTagClass(status: InvoiceItem["status"]): string {
  if (status === "OVERDUE") {
    return styles.tagOverdue;
  }

  if (status === "PENDING") {
    return styles.tagPending;
  }

  return styles.tagPaid;
}

export default async function InvoicesPage() {
  const { requestOptions, shellProps } = await loadBuyerShellContext("/invoices");
  const response = await api.finance.invoices.list<InvoiceListResponse>(requestOptions).catch(() => ({
    invoices: [],
  }));

  return (
    <BuyerShell
      activePage="invoices"
      invoicesDue={shellProps.invoicesDue}
      companyName={shellProps.companyName}
      companyEmail={shellProps.companyEmail}
      tier={shellProps.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Invoices</h1>
          <p>Pay within 48 hours of winning to avoid deposit loss.</p>
        </header>

        {response.invoices.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>No invoices yet</h2>
            <p>When you win a lot, your payment deadline and invoice actions will appear here.</p>
          </section>
        ) : (
          <div className={styles.list}>
            {response.invoices.map((invoice) => (
              <article
                key={invoice.id}
                className={[styles.card, resolveCardClass(invoice.status)].filter(Boolean).join(" ")}
              >
                <div className={styles.cardTop}>
                  <div className={styles.invoiceMeta}>
                    <span>{invoice.lotNumber}</span>
                    <h2>{invoice.lotTitle}</h2>
                    <p>Invoice ID {invoice.id}</p>
                  </div>

                  <div className={styles.amountMeta}>
                    <strong>{formatAed(invoice.amount)}</strong>
                    <span>
                      {invoice.status === "PAID" ? "Paid" : "Due"} {formatDeadline(invoice.dueAt)}
                    </span>
                  </div>
                </div>

                <div className={styles.cardBottom}>
                  <span className={[styles.tag, resolveTagClass(invoice.status)].join(" ")}>
                    {resolveStatusLabel(invoice.status)}
                  </span>

                  <div className={styles.actions}>
                    {invoice.status === "PAID" ? (
                      <Link href={`/finance/invoices/${invoice.id}`} className={styles.secondaryButton}>
                        Download PDF
                      </Link>
                    ) : (
                      <>
                        <Link href={`/finance/invoices/${invoice.id}`} className={styles.secondaryButton}>
                          View invoice
                        </Link>
                        <Link href={`/finance/invoices/${invoice.id}`} className={styles.primaryButton}>
                          Pay now
                        </Link>
                      </>
                    )}
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
