"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import { AdminDetailModal } from "@/app/admin/components/AdminDetailModal";
import { api } from "@/src/lib/api-client";
import { getAdminCopy } from "@/app/admin/i18n";
import { toIntlLocale, type SupportedLocale } from "@/src/i18n/routing";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

type VehicleStatus = "PENDING" | "APPROVED" | "REJECTED";

type VehicleRow = {
  id: string;
  imageUrl: string | null;
  title: string;
  vin: string;
  status: VehicleStatus;
  companyName: string;
  marketPriceAed: number | null;
  auctionId: string | null;
  assignedEventId: string | null;
  assignedEventLabel: string | null;
  approvalStatusLabel: string | null;
};

type EventOption = {
  id: string;
  label: string;
};

type EventsResponse = {
  events?: {
    id: string;
    title: string;
    startsAt: string;
    status: string;
  }[];
};

type VehiclesTableProps = {
  rows: VehicleRow[];
  events: EventOption[];
  locale: SupportedLocale;
};

export function VehiclesTable({ rows, events, locale }: VehiclesTableProps) {
  const router = useRouter();
  const t = getAdminCopy(locale);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraftById, setPriceDraftById] = useState<Record<string, string>>({});
  const [eventDraftById, setEventDraftById] = useState<Record<string, string>>({});
  const [eventOptions, setEventOptions] = useState<EventOption[]>(events);
  const [selectedVehicle, setSelectedVehicle] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents(): Promise<void> {
      try {
        const payload = await api.admin.events.list<EventsResponse>(undefined, {
          cache: "no-store",
        });
        const nextOptions = (payload.events ?? [])
          .filter((event) => event.status === "DRAFT" || event.status === "SCHEDULED")
          .map((event) => ({
            id: event.id,
            label: `${event.title} • ${new Date(event.startsAt).toLocaleString(toIntlLocale(locale), {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          }));

        if (!cancelled) {
          setEventOptions(nextOptions);
        }
      } catch {
        // Keep server-rendered options when fetch fails.
      }
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [locale]);

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

  async function saveMarketPrice(id: string): Promise<void> {
    const draft = priceDraftById[id] ?? "";
    const value = Number(draft);

    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    setBusyId(id);

    try {
      await api.admin.vehicles.setMarketPrice(id, {
        priceAed: value,
      });

      setEditingPriceId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function assignEvent(id: string, eventId: string | null): Promise<void> {
    setBusyId(id);

    try {
      await api.admin.vehicles.assignEvent(id, {
        eventId,
      });

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
                <th>{t.vehicles.table.marketPrice}</th>
                <th>{t.vehicles.table.event}</th>
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
                    <div className={styles.statusStack}>
                      {row.status === "PENDING" ? (
                        <span className="pill pill-sched">{t.status.pending}</span>
                      ) : null}
                      {row.status === "APPROVED" ? (
                        <span className="pill pill-green">{t.status.approved}</span>
                      ) : null}
                      {row.status === "REJECTED" ? <span className="pill">{t.status.rejected}</span> : null}
                      {row.approvalStatusLabel ? (
                        <span className={styles.metaText}>{row.approvalStatusLabel}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{row.companyName}</td>
                  <td>
                    {editingPriceId === row.id ? (
                      <div className={styles.inlineEdit}>
                        <input
                          type="number"
                          min={1}
                          value={priceDraftById[row.id] ?? (row.marketPriceAed === null ? "" : String(row.marketPriceAed))}
                          onChange={(event) =>
                            setPriceDraftById((prev) => ({
                              ...prev,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => void saveMarketPrice(row.id)}
                        >
                          {t.vehicles.actions.save}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.inlineEdit}>
                        <span>{row.marketPriceAed === null ? "-" : formatAed(row.marketPriceAed)}</span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setEditingPriceId(row.id);
                            setPriceDraftById((prev) => ({
                              ...prev,
                              [row.id]: row.marketPriceAed === null ? "" : String(row.marketPriceAed),
                            }));
                          }}
                        >
                          {t.vehicles.actions.edit}
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    {row.assignedEventId ? (
                      <div className={styles.inlineEdit}>
                        <span>{row.assignedEventLabel}</span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => void assignEvent(row.id, null)}
                        >
                          {t.vehicles.actions.unassign}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.inlineEdit}>
                        <select
                          value={eventDraftById[row.id] ?? ""}
                          onChange={(event) =>
                            setEventDraftById((prev) => ({
                              ...prev,
                              [row.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">{t.vehicles.actions.selectEvent}</option>
                          {eventOptions.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === row.id || !(eventDraftById[row.id] ?? "")}
                          onClick={() => void assignEvent(row.id, eventDraftById[row.id] ?? null)}
                        >
                          {t.vehicles.actions.assign}
                        </button>
                      </div>
                    )}
                  </td>
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
                  <td colSpan={8} className={styles.emptyCell}>
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
