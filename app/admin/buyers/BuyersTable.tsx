"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import { getAdminCopy } from "@/app/admin/i18n";
import type { SupportedLocale } from "@/src/i18n/routing";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

type DepositStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

type BuyerRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  depositStatus: DepositStatus;
  amountAed: number;
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

  const filtered = useMemo(() => {
    if (tab === "all") {
      return buyers;
    }

    return buyers.filter((buyer) => buyer.depositStatus === "PENDING");
  }, [buyers, tab]);

  async function mutateDeposit(id: string, action: "approve-deposit" | "reject-deposit"): Promise<void> {
    setBusyId(id);

    try {
      await fetch(`/api/admin/buyers/${id}/${action}`, {
        method: "POST",
      });
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
                <th>{t.buyers.table.company}</th>
                <th>{t.buyers.table.depositStatus}</th>
                <th>{t.buyers.table.amount}</th>
                <th>{t.buyers.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((buyer) => (
                <tr key={buyer.id}>
                  <td>{buyer.name}</td>
                  <td>{buyer.phone}</td>
                  <td>{buyer.email}</td>
                  <td>{buyer.company}</td>
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
                  <td>{formatAed(buyer.amountAed || 0)}</td>
                  <td>
                    {buyer.depositStatus === "PENDING" ? (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === buyer.id}
                          onClick={() => void mutateDeposit(buyer.id, "approve-deposit")}
                        >
                          {t.buyers.actions.approveDeposit}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === buyer.id}
                          onClick={() => void mutateDeposit(buyer.id, "reject-deposit")}
                        >
                          {t.buyers.actions.rejectDeposit}
                        </button>
                      </div>
                    ) : (
                      <span className={styles.metaText}>{t.buyers.actions.noPendingAction}</span>
                    )}
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
    </section>
  );
}
