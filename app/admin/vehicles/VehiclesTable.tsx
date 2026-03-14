"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FilterTabs } from "@/app/admin/components/FilterTabs";
import { api } from "@/src/lib/api-client";
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
  marketPriceAed: number;
  auctionId: string | null;
  assignedEventId: string | null;
  assignedEventLabel: string | null;
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
  }[];
};

type VehiclesTableProps = {
  rows: VehicleRow[];
  events: EventOption[];
};

export function VehiclesTable({ rows, events }: VehiclesTableProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraftById, setPriceDraftById] = useState<Record<string, string>>({});
  const [eventDraftById, setEventDraftById] = useState<Record<string, string>>({});
  const [eventOptions, setEventOptions] = useState<EventOption[]>(events);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents(): Promise<void> {
      try {
        const payload = await api.admin.events.list<EventsResponse>({ status: "SCHEDULED" }, {
          cache: "no-store",
        });
        const nextOptions = (payload.events ?? []).map((event) => ({
          id: event.id,
          label: `${event.title} • ${new Date(event.startsAt).toLocaleString("en-GB", {
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
  }, []);

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
        <h1 className={styles.heading}>Vehicles</h1>
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
        <div className={styles.sectionTitle}>Vehicle Approval & Assignment</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Brand / Model / Year</th>
                <th>VIN</th>
                <th>Status</th>
                <th>Company</th>
                <th>Market Price</th>
                <th>Event</th>
                <th>Actions</th>
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
                      <span className="pill pill-sched">Pending</span>
                    ) : null}
                    {row.status === "APPROVED" ? (
                      <span className="pill pill-green">Approved</span>
                    ) : null}
                    {row.status === "REJECTED" ? <span className="pill">Rejected</span> : null}
                  </td>
                  <td>{row.companyName}</td>
                  <td>
                    {editingPriceId === row.id ? (
                      <div className={styles.inlineEdit}>
                        <input
                          type="number"
                          min={1}
                          value={priceDraftById[row.id] ?? String(row.marketPriceAed || "")}
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
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className={styles.inlineEdit}> 
                        <span>{formatAed(row.marketPriceAed || 0)}</span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setEditingPriceId(row.id);
                            setPriceDraftById((prev) => ({
                              ...prev,
                              [row.id]: String(row.marketPriceAed || ""),
                            }));
                          }}
                        >
                          Edit
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
                          Unassign
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
                          <option value="">Select event</option>
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
                          Assign
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    {row.status === "PENDING" ? (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => void mutateVehicle(row.id, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => void mutateVehicle(row.id, "reject")}
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
                  <td colSpan={8} className={styles.emptyCell}>
                    No vehicles found for this filter.
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
