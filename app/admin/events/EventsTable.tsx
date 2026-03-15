"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { getAdminCopy } from "@/app/admin/i18n";
import { toIntlLocale, type SupportedLocale } from "@/src/i18n/routing";
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
  locale: SupportedLocale;
};

export function EventsTable({ events, locale }: EventsTableProps) {
  const router = useRouter();
  const t = getAdminCopy(locale);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function deleteEvent(id: string): Promise<void> {
    setBusyId(id);

    try {
      await api.admin.events.remove(id);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>{t.events.heading}</h1>
        <Link href="/admin/events/new" className="btn btn-primary">
          {t.events.createEvent}
        </Link>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.events.sectionTitle}</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.events.table.title}</th>
                <th>{t.events.table.dateTime}</th>
                <th>{t.events.table.status}</th>
                <th>{t.events.table.lots}</th>
                <th>{t.events.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.title}</td>
                  <td>
                    {new Date(event.startsAt).toLocaleString(toIntlLocale(locale), {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    {event.status === "DRAFT" ? <span className="pill">{t.status.draft}</span> : null}
                    {event.status === "SCHEDULED" ? <span className="pill pill-sched">{t.status.scheduled}</span> : null}
                    {event.status === "LIVE" ? (
                      <span className="pill pill-live">
                        <span className="live-dot" aria-hidden />
                        {t.status.live}
                      </span>
                    ) : null}
                    {event.status === "ENDED" ? <span className="pill">{t.status.ended}</span> : null}
                  </td>
                  <td>{event.lotsCount}</td>
                  <td>
                    <div className={styles.actions}>
                      <Link href={`/admin/events/${event.id}`} className="btn btn-outline btn-sm">
                        {t.events.actions.edit}
                      </Link>
                      {event.status === "DRAFT" ? (
                        <button
                          type="button"
                          className={`btn btn-outline btn-sm ${styles.deleteBtn}`}
                          disabled={busyId === event.id}
                          onClick={() => void deleteEvent(event.id)}
                        >
                          {t.events.actions.delete}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    {t.events.empty}
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
