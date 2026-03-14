"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

type EventState = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED";

type EventRow = {
  id: string;
  title: string;
  startsAt: string;
  status: EventState;
  lotsCount: number;
};

type EventsTableProps = {
  events: EventRow[];
};

export function EventsTable({ events }: EventsTableProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function deleteEvent(id: string): Promise<void> {
    setBusyId(id);

    try {
      await fetch(`/api/admin/events/${id}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>Events</h1>
        <Link href="/admin/events/new" className="btn btn-primary">
          + Create Event
        </Link>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Auction Events</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Date & Time</th>
                <th>Status</th>
                <th>Lots</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.title}</td>
                  <td>
                    {new Date(event.startsAt).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    {event.status === "DRAFT" ? <span className="pill">Draft</span> : null}
                    {event.status === "SCHEDULED" ? <span className="pill pill-sched">Scheduled</span> : null}
                    {event.status === "LIVE" ? (
                      <span className="pill pill-live">
                        <span className="live-dot" aria-hidden />
                        Live
                      </span>
                    ) : null}
                    {event.status === "ENDED" ? <span className="pill">Ended</span> : null}
                  </td>
                  <td>{event.lotsCount}</td>
                  <td>
                    <div className={styles.actions}>
                      <Link href={`/admin/events/${event.id}`} className="btn btn-outline btn-sm">
                        Edit
                      </Link>
                      {event.status === "DRAFT" ? (
                        <button
                          type="button"
                          className={`btn btn-outline btn-sm ${styles.deleteBtn}`}
                          disabled={busyId === event.id}
                          onClick={() => void deleteEvent(event.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    No events found.
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
