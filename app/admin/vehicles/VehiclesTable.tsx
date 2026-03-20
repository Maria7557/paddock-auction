"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import { AdminDetailModal } from "@/app/admin/components/AdminDetailModal";
import { getAdminCopy } from "@/app/admin/i18n";
import { api } from "@/src/lib/api-client";
import type { SupportedLocale } from "@/src/i18n/routing";

import styles from "./page.module.css";

type VehicleStatus = "PENDING" | "APPROVED" | "REJECTED";

type VehicleRow = {
  id: string;
  imageUrl: string | null;
  title: string;
  vin: string;
  status: VehicleStatus;
  companyName: string;
  auctionId: string | null;
};

type VehiclesTableProps = {
  rows: VehicleRow[];
  locale: SupportedLocale;
};

export function VehiclesTable({ rows, locale }: VehiclesTableProps) {
  const router = useRouter();
  const t = getAdminCopy(locale);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<{ id: string; label: string } | null>(null);

  const filtered = useMemo(() => {
    if (tab === "all") {
      return rows;
    }

    return rows.filter((row) => row.status === "PENDING");
  }, [rows, tab]);

  async function mutateVehicle(
    id: string,
    action: "approve" | "reject",
  ): Promise<void> {
    setBusyId(id);

    try {
      if (action === "approve") {
        await api.admin.vehicles.approve(id);
      } else {
        await api.admin.vehicles.reject(id);
      }

      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>{t.vehicles.heading}</h1>
        <FilterTabs
          tabs={[
            { id: "pending", label: t.vehicles.tabs.pending },
            { id: "all", label: t.vehicles.tabs.all },
          ]}
          value={tab}
          onChange={(next) => setTab(next as "pending" | "all")}
          ariaLabel={t.filtersAriaLabel}
        />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.vehicles.sectionTitle}</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.vehicles.table.photo}</th>
                <th>{t.vehicles.table.vehicle}</th>
                <th>{t.vehicles.table.vin}</th>
                <th>{t.vehicles.table.status}</th>
                <th>{t.vehicles.table.company}</th>
                <th>{t.vehicles.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.imageUrl ? (
                      <img
                        src={row.imageUrl}
                        alt={row.title}
                        className={styles.thumb}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.thumbPlaceholder} aria-hidden />
                    )}
                  </td>
                  <td>{row.title}</td>
                  <td className={styles.mono}>{row.vin}</td>
                  <td>
                    {row.status === "PENDING" ? (
                      <span className="pill pill-sched">{t.status.pending}</span>
                    ) : null}
                    {row.status === "APPROVED" ? (
                      <span className="pill pill-green">{t.status.approved}</span>
                    ) : null}
                    {row.status === "REJECTED" ? <span className="pill">{t.status.rejected}</span> : null}
                  </td>
                  <td>{row.companyName}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setSelectedVehicle({ id: row.id, label: row.title })}
                      >
                        {t.vehicles.actions.view}
                      </button>
                    {row.status === "PENDING" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => void mutateVehicle(row.id, "approve")}
                        >
                          {t.vehicles.actions.approve}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => void mutateVehicle(row.id, "reject")}
                        >
                          {t.vehicles.actions.reject}
                        </button>
                      </>
                    ) : (
                      <span className={styles.metaText}>{t.vehicles.actions.noPendingAction}</span>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    {t.vehicles.empty}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {selectedVehicle ? (
        <AdminDetailModal
          entity={{
            kind: "vehicle",
            id: selectedVehicle.id,
            label: selectedVehicle.label,
          }}
          locale={locale}
          onClose={() => setSelectedVehicle(null)}
        />
      ) : null}
    </section>
  );
}
