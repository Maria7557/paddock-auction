"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
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
};

export function BuyersTable({ buyers }: BuyersTableProps) {
  const router = useRouter();
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
        <h1 className={styles.heading}>Buyers</h1>
        <FilterTabs
          tabs={[
            { id: "pending", label: "Pending Deposit Approval" },
            { id: "all", label: "All" },
          ]}
          value={tab}
          onChange={(next) => setTab(next as "pending" | "all")}
        />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Buyer Deposit Review</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Company</th>
                <th>Deposit Status</th>
                <th>Amount</th>
                <th>Actions</th>
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
                    {buyer.depositStatus === "NONE" ? <span className="pill">None</span> : null}
                    {buyer.depositStatus === "PENDING" ? (
                      <span className={`pill ${styles.pendingPill}`}>Pending</span>
                    ) : null}
                    {buyer.depositStatus === "APPROVED" ? (
                      <span className="pill pill-green">Approved</span>
                    ) : null}
                    {buyer.depositStatus === "REJECTED" ? <span className="pill">Rejected</span> : null}
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
                          Approve Deposit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === buyer.id}
                          onClick={() => void mutateDeposit(buyer.id, "reject-deposit")}
                        >
                          Reject Deposit
                        </button>
                      </div>
                    ) : (
                      <span className={styles.metaText}>No pending action</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
                    No buyers found for this filter.
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
