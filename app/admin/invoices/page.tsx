"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import {
  ApiError,
  api,
  buildApiUrl,
  type AdminInvoiceListItem,
  type AdminInvoiceStatus,
} from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

type InvoiceFilter = "ALL" | "ISSUED" | "PAID_PENDING_CONFIRMATION" | "PAID" | "DEFAULTED";
type CompanyKind = "seller" | "buyer";
type ActionModalState =
  | {
      kind: "confirm-payment";
      invoice: AdminInvoiceListItem;
    }
  | {
      kind: "relist";
      invoice: AdminInvoiceListItem;
    }
  | null;

const FILTER_TABS: Array<{ id: InvoiceFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "ISSUED", label: "Payment Pending" },
  { id: "PAID_PENDING_CONFIRMATION", label: "Payment Claimed" },
  { id: "PAID", label: "Paid" },
  { id: "DEFAULTED", label: "Defaulted" },
];

function formatAuctionDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDeadlineDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatCountdownLabel(targetIso: string, now: number): string {
  const diffMs = new Date(targetIso).getTime() - now;

  if (diffMs <= 0) {
    return "Overdue";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getStatusPresentation(status: AdminInvoiceStatus): { label: string; className: string } {
  switch (status) {
    case "ISSUED":
      return { label: "Payment Pending", className: styles.badgeAmber };
    case "PAID_PENDING_CONFIRMATION":
      return { label: "Payment Claimed", className: styles.badgeBlue };
    case "PAID":
      return { label: "Paid ✓", className: styles.badgeGreen };
    case "DEFAULTED":
      return { label: "Defaulted", className: styles.badgeRed };
    case "CANCELED":
      return { label: "Cancelled", className: styles.badgeGrey };
    default:
      return { label: status, className: styles.badgeGrey };
  }
}

function getModalCopy(modal: Exclude<ActionModalState, null>) {
  if (modal.kind === "relist") {
    return {
      title: "Relist this lot?",
      confirmLabel: "Confirm Relist",
      confirmClassName: styles.dangerButton,
      description: `Auction for ${modal.invoice.lotTitle} will be moved to RELISTED status. The buyer's deposit will be burned.`,
    };
  }

  return {
    title: "Confirm Payment",
    confirmLabel: "Confirm",
    confirmClassName: "btn btn-primary",
    description: null,
  };
}

export default function AdminInvoicesPage() {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<InvoiceFilter>("ALL");
  const [invoices, setInvoices] = useState<AdminInvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ActionModalState>(null);
  const [noticeByInvoiceId, setNoticeByInvoiceId] = useState<Record<string, string>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoices(): Promise<void> {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await api.admin.invoices.list({
          status: selectedFilter === "ALL" ? undefined : selectedFilter,
          page: 1,
          limit: 50,
        });

        if (cancelled) {
          return;
        }

        setInvoices(response.invoices);
        setTotal(response.total);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403)) {
          router.replace("/login");
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Failed to load invoices.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInvoices();

    return () => {
      cancelled = true;
    };
  }, [reloadToken, router, selectedFilter]);

  function toggleExpanded(invoiceId: string, companyKind: CompanyKind): void {
    const key = `${invoiceId}:${companyKind}`;

    setExpandedRows((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function applyInvoiceUpdate(invoiceId: string, nextStatus: AdminInvoiceStatus, paidAt: string | null): void {
    setInvoices((current) => {
      const nextRows = current
        .map((invoice) => (
          invoice.id === invoiceId
            ? {
                ...invoice,
                status: nextStatus,
                paidAt,
              }
            : invoice
        ))
        .filter((invoice) => selectedFilter === "ALL" || invoice.status === selectedFilter);

      return nextRows;
    });

    if (selectedFilter !== "ALL" && selectedFilter !== nextStatus) {
      setTotal((current) => Math.max(0, current - 1));
    }
  }

  async function submitModalAction(): Promise<void> {
    if (!modalState) {
      return;
    }

    setBusyInvoiceId(modalState.invoice.id);
    setErrorMessage(null);

    try {
      if (modalState.kind === "confirm-payment") {
        const response = await api.admin.invoices.confirmPayment(modalState.invoice.id);

        applyInvoiceUpdate(modalState.invoice.id, "PAID", response.paidAt);
        setNoticeByInvoiceId((current) => ({
          ...current,
          [modalState.invoice.id]: "Payment confirmed ✓",
        }));
      } else {
        await api.admin.auctions.relistInvoiceAuction(modalState.invoice.auctionId);

        applyInvoiceUpdate(modalState.invoice.id, "CANCELED", null);
        setNoticeByInvoiceId((current) => ({
          ...current,
          [modalState.invoice.id]: "Lot relisted ✓",
        }));
      }

      setModalState(null);
    } catch (error) {
      if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403)) {
        router.replace("/login");
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyInvoiceId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.heading}>Invoices</h1>
          <p className={styles.subheading}>Track payment status, confirm receipts, and relist defaulted lots.</p>
        </div>
        <FilterTabs
          tabs={FILTER_TABS}
          value={selectedFilter}
          onChange={(next) => setSelectedFilter(next as InvoiceFilter)}
          ariaLabel="Invoice status filters"
        />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Invoice Management · {total}</div>

        {loading ? <div className={styles.stateMessage}>Loading...</div> : null}

        {!loading && errorMessage ? (
          <div className={styles.stateMessage}>
            <p>{errorMessage}</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setReloadToken((current) => current + 1)}>
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !errorMessage ? (
          <div className={styles.scrollWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Auction Date</th>
                  <th>Lot</th>
                  <th>Seller</th>
                  <th>Buyer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const showSeller = expandedRows[`${invoice.id}:seller`];
                  const showBuyer = expandedRows[`${invoice.id}:buyer`];
                  const showExpandedRow = showSeller || showBuyer;
                  const status = getStatusPresentation(invoice.status);
                  const deadlineClassName =
                    invoice.urgency === "critical"
                      ? styles.deadlineCritical
                      : invoice.urgency === "warning"
                        ? styles.deadlineWarning
                        : styles.deadlineNormal;
                  const isBusy = busyInvoiceId === invoice.id;

                  return [
                    (
                      <tr key={invoice.id} className={styles.dataRow}>
                        <td>{formatAuctionDate(invoice.auctionClosedAt)}</td>
                        <td>
                          <div className={styles.lotCell}>
                            <strong>{invoice.lotTitle}</strong>
                            <span className={styles.metaText}>#{invoice.id.slice(0, 8).toUpperCase()}</span>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.companyButton}
                            onClick={() => toggleExpanded(invoice.id, "seller")}
                          >
                            {invoice.seller.name}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.companyButton}
                            onClick={() => toggleExpanded(invoice.id, "buyer")}
                          >
                            {invoice.buyer.name}
                          </button>
                        </td>
                        <td>{formatAed(invoice.total)}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${status.className}`.trim()}>{status.label}</span>
                        </td>
                        <td className={deadlineClassName}>
                          <div className={styles.deadlineCell}>
                            <span>{formatDeadlineDate(invoice.dueAt)}</span>
                            <span>{formatCountdownLabel(invoice.dueAt, now)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.actions}>
                            {invoice.status === "ISSUED" ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={isBusy}
                                onClick={() => setModalState({ kind: "confirm-payment", invoice })}
                              >
                                Mark as Paid
                              </button>
                            ) : null}
                            {invoice.status === "PAID_PENDING_CONFIRMATION" ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={isBusy}
                                onClick={() => setModalState({ kind: "confirm-payment", invoice })}
                              >
                                Confirm Payment
                              </button>
                            ) : null}
                            {invoice.status === "DEFAULTED" ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  disabled={isBusy}
                                  onClick={() => setModalState({ kind: "confirm-payment", invoice })}
                                >
                                  Mark as Paid
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.dangerButton} ${styles.smallDangerButton}`.trim()}
                                  disabled={isBusy}
                                  onClick={() => setModalState({ kind: "relist", invoice })}
                                >
                                  Relist Lot
                                </button>
                              </>
                            ) : null}
                            {invoice.status === "PAID" ? (
                              <a
                                href={buildApiUrl(`/api/admin/invoices/${invoice.id}/pdf`)}
                                className={styles.linkAction}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download Receipt
                              </a>
                            ) : null}
                            {invoice.status === "CANCELED" ? <span className={styles.metaText}>—</span> : null}
                          </div>
                          {noticeByInvoiceId[invoice.id] ? (
                            <div className={styles.inlineNotice}>{noticeByInvoiceId[invoice.id]}</div>
                          ) : null}
                        </td>
                      </tr>
                    ),
                    showExpandedRow ? (
                        <tr key={`${invoice.id}-expanded`} className={styles.expandedRow}>
                          <td colSpan={8}>
                            <div className={styles.expandedGrid}>
                              {showSeller ? (
                                <div className={styles.expandedCard}>
                                  <div className={styles.expandedTitle}>Seller</div>
                                  <div>Phone: {invoice.seller.phone || "—"}</div>
                                  <div>Registration: {invoice.seller.registrationNumber}</div>
                                  <div>Country: {invoice.seller.country}</div>
                                </div>
                              ) : null}
                              {showBuyer ? (
                                <div className={styles.expandedCard}>
                                  <div className={styles.expandedTitle}>Buyer</div>
                                  <div>Phone: {invoice.buyer.phone || "—"}</div>
                                  <div>Registration: {invoice.buyer.registrationNumber}</div>
                                  <div>Country: {invoice.buyer.country}</div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                    ) : null,
                  ];
                })}
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.emptyCell}>
                      No invoices found for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {modalState ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="admin-invoice-modal-title">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 id="admin-invoice-modal-title" className={styles.modalTitle}>
                {getModalCopy(modalState).title}
              </h2>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setModalState(null)} disabled={busyInvoiceId === modalState.invoice.id}>
                Cancel
              </button>
            </div>

            {modalState.kind === "confirm-payment" ? (
              <div className={styles.modalBody}>
                <div className={styles.modalList}>
                  <div className={styles.modalListRow}>
                    <span>Buyer</span>
                    <strong>{modalState.invoice.buyer.name}</strong>
                  </div>
                  <div className={styles.modalListRow}>
                    <span>Lot</span>
                    <strong>{modalState.invoice.lotTitle}</strong>
                  </div>
                  <div className={styles.modalListRow}>
                    <span>Amount</span>
                    <strong>{formatAed(modalState.invoice.total)}</strong>
                  </div>
                  <div className={styles.modalListRow}>
                    <span>Invoice</span>
                    <strong>#{modalState.invoice.id.slice(0, 8).toUpperCase()}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.modalBody}>
                <p className={styles.modalText}>{getModalCopy(modalState).description}</p>
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={getModalCopy(modalState).confirmClassName}
                onClick={() => void submitModalAction()}
                disabled={busyInvoiceId === modalState.invoice.id}
              >
                {getModalCopy(modalState).confirmLabel}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setModalState(null)}
                disabled={busyInvoiceId === modalState.invoice.id}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
