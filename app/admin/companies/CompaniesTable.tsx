"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import { api } from "@/src/lib/api-client";

import styles from "./page.module.css";

type CompanyRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

type CompaniesTableProps = {
  companies: CompanyRow[];
};

export function CompaniesTable({ companies }: CompaniesTableProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (tab === "all") {
      return companies;
    }

    return companies.filter((company) => company.status === "PENDING");
  }, [companies, tab]);

  async function mutateCompany(id: string, action: "approve" | "reject"): Promise<void> {
    setBusyId(id);

    try {
      if (action === "approve") {
        await api.admin.companies.approve(id);
      } else {
        await api.admin.companies.reject(id);
      }

      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>Companies</h1>
        <FilterTabs
          tabs={[
            { id: "pending", label: "New (Pending)" },
            { id: "all", label: "All" },
          ]}
          value={tab}
          onChange={(next) => setTab(next as "pending" | "all")}
        />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Company Review Queue</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Registration Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => (
                <tr key={company.id}>
                  <td>{company.name}</td>
                  <td>{company.email}</td>
                  <td>{company.phone}</td>
                  <td>
                    {company.status === "PENDING" ? (
                      <span className="pill pill-sched">Pending</span>
                    ) : null}
                    {company.status === "APPROVED" ? (
                      <span className="pill pill-green">Approved</span>
                    ) : null}
                    {company.status === "REJECTED" ? <span className="pill">Rejected</span> : null}
                  </td>
                  <td>
                    {new Date(company.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    {company.status === "PENDING" ? (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === company.id}
                          onClick={() => void mutateCompany(company.id, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === company.id}
                          onClick={() => void mutateCompany(company.id, "reject")}
                        >
                          Reject
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
                  <td colSpan={6} className={styles.emptyCell}>
                    No companies found for this filter.
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
