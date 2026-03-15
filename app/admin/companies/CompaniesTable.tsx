"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import { api, getApiErrorMessage, getApiErrorPayload } from "@/src/lib/api-client";
import { getAdminCopy } from "@/app/admin/i18n";
import { toIntlLocale, type SupportedLocale } from "@/src/i18n/routing";

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
  locale: SupportedLocale;
};

export function CompaniesTable({ companies, locale }: CompaniesTableProps) {
  const router = useRouter();
  const t = getAdminCopy(locale);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (tab === "all") {
      return companies;
    }

    return companies.filter((company) => company.status === "PENDING");
  }, [companies, tab]);

  async function mutateCompany(id: string, action: "approve" | "reject"): Promise<void> {
    setBusyId(id);
    setFeedback(null);

    try {
      if (action === "approve") {
        await api.admin.companies.approve(id);
      } else {
        await api.admin.companies.reject(id);
      }

      router.refresh();
    } catch (error) {
      const payload = getApiErrorPayload<{ error?: string }>(error);

      if (payload?.error === "COMPANY_NOT_FOUND") {
        setFeedback("Company no longer exists or was already updated. The list has been refreshed.");
        router.refresh();
        return;
      }

      setFeedback(getApiErrorMessage(error, "Failed to update company status."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>{t.companies.heading}</h1>
        <FilterTabs
          tabs={[
            { id: "pending", label: t.companies.tabs.pending },
            { id: "all", label: t.companies.tabs.all },
          ]}
          value={tab}
          onChange={(next) => setTab(next as "pending" | "all")}
          ariaLabel={t.filtersAriaLabel}
        />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.companies.sectionTitle}</div>
        {feedback ? (
          <div className={styles.feedback} role="alert">
            {feedback}
          </div>
        ) : null}
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.companies.table.company}</th>
                <th>{t.companies.table.email}</th>
                <th>{t.companies.table.phone}</th>
                <th>{t.companies.table.status}</th>
                <th>{t.companies.table.registrationDate}</th>
                <th>{t.companies.table.actions}</th>
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
                      <span className="pill pill-sched">{t.status.pending}</span>
                    ) : null}
                    {company.status === "APPROVED" ? (
                      <span className="pill pill-green">{t.status.approved}</span>
                    ) : null}
                    {company.status === "REJECTED" ? <span className="pill">{t.status.rejected}</span> : null}
                  </td>
                  <td>
                    {new Date(company.createdAt).toLocaleDateString(toIntlLocale(locale), {
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
                          {t.companies.actions.approve}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === company.id}
                          onClick={() => void mutateCompany(company.id, "reject")}
                        >
                          {t.companies.actions.reject}
                        </button>
                      </div>
                    ) : (
                      <span className={styles.metaText}>{t.companies.actions.noPendingAction}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    {t.companies.empty}
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
