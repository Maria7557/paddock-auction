"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import { AdminDetailModal } from "@/app/admin/components/AdminDetailModal";
import { api } from "@/src/lib/api-client";
import { getAdminCopy } from "@/app/admin/i18n";
import type { SupportedLocale } from "@/src/i18n/routing";

import styles from "./page.module.css";

type DepositStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";
type AccountStatus = "PENDING_APPROVAL" | "ACTIVE" | "BLOCKED" | "REJECTED";

type BuyerRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  accountStatus: AccountStatus;
  depositStatus: DepositStatus;
  amountAed: number;
  createdAt: string;
};

type BuyersTableProps = {
  buyers: BuyerRow[];
  locale: SupportedLocale;
};

export function BuyersTable({ buyers, locale }: BuyersTableProps) {
  const router = useRouter();
  const t = getAdminCopy(locale);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedBuyer, setSelectedBuyer] = useState<{ id: string; label: string } | null>(null);

  const filtered = useMemo(() => {
    if (tab === "all") {
      return buyers;
    }

    return buyers.filter(
      (buyer) => buyer.accountStatus === "PENDING_APPROVAL" || buyer.depositStatus === "PENDING",
    );
  }, [buyers, tab]);

  async function mutateBuyer(id: string, action: "approve" | "reject" | "approve-deposit" | "reject-deposit"): Promise<void> {
    setBusyId(id);

    try {
      if (action === "approve") {
        await api.admin.users.approve(id);
      } else if (action === "reject") {
        await api.admin.users.reject(id);
      } else if (action === "approve-deposit") {
        await api.admin.buyers.approveDeposit(id);
      } else {
        await api.admin.buyers.rejectDeposit(id);
      }

      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>{t.buyers.heading}</h1>
        <FilterTabs
          tabs={[
            { id: "pending", label: t.buyers.tabs.pending },
            { id: "all", label: t.buyers.tabs.all },
          ]}
          value={tab}
          onChange={(next) => setTab(next as "pending" | "all")}
          ariaLabel={t.filtersAriaLabel}
        />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.buyers.sectionTitle}</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.buyers.table.name}</th>
                <th>{t.buyers.table.phone}</th>
                <th>{t.buyers.table.email}</th>
                <th>{t.buyers.table.accountStatus}</th>
                <th>{t.buyers.table.depositStatus}</th>
                <th>{t.buyers.table.registrationDate}</th>
                <th>{t.buyers.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((buyer) => (
                <tr key={buyer.id}>
                  <td>{buyer.name}</td>
                  <td>{buyer.phone}</td>
                  <td>{buyer.email}</td>
                  <td>
                    {buyer.accountStatus === "PENDING_APPROVAL" ? (
                      <span className="pill pill-sched">{t.status.pending}</span>
                    ) : null}
                    {buyer.accountStatus === "ACTIVE" ? (
                      <span className="pill pill-green">{t.status.approved}</span>
                    ) : null}
                    {buyer.accountStatus === "BLOCKED" ? <span className="pill">{t.status.blocked}</span> : null}
                    {buyer.accountStatus === "REJECTED" ? <span className="pill">{t.status.rejected}</span> : null}
                  </td>
                  <td>
                    {buyer.depositStatus === "NONE" ? <span className="pill">{t.status.none}</span> : null}
                    {buyer.depositStatus === "PENDING" ? (
                      <span className="pill pill-sched">{t.status.pending}</span>
                    ) : null}
                    {buyer.depositStatus === "APPROVED" ? (
                      <span className="pill pill-green">{t.status.approved}</span>
                    ) : null}
                    {buyer.depositStatus === "REJECTED" ? <span className="pill">{t.status.rejected}</span> : null}
                  </td>
                  <td>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(buyer.createdAt))}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setSelectedBuyer({ id: buyer.id, label: buyer.name })}
                      >
                        {t.buyers.actions.view}
                      </button>
                    {buyer.accountStatus === "PENDING_APPROVAL" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === buyer.id}
                          onClick={() => void mutateBuyer(buyer.id, "approve")}
                        >
                          {t.buyers.actions.approve}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === buyer.id}
                          onClick={() => void mutateBuyer(buyer.id, "reject")}
                        >
                          {t.buyers.actions.reject}
                        </button>
                      </>
                    ) : buyer.depositStatus === "PENDING" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === buyer.id}
                          onClick={() => void mutateBuyer(buyer.id, "approve-deposit")}
                        >
                          {t.buyers.actions.approveDeposit}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === buyer.id}
                          onClick={() => void mutateBuyer(buyer.id, "reject-deposit")}
                        >
                          {t.buyers.actions.rejectDeposit}
                        </button>
                      </>
                    ) : (
                      <span className={styles.metaText}>{t.buyers.actions.noPendingAction}</span>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
                    {t.buyers.empty}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {selectedBuyer ? (
        <AdminDetailModal
          entity={{
            kind: "buyer",
            id: selectedBuyer.id,
            label: selectedBuyer.label,
          }}
          locale={locale}
          onClose={() => setSelectedBuyer(null)}
        />
      ) : null}
    </section>
  );
}
