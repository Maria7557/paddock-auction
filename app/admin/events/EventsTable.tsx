"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { type AdminEventListEntry, api, getApiErrorMessage } from "@/src/lib/api-client";
import { getAdminCopy } from "@/app/admin/i18n";
import { toIntlLocale, type SupportedLocale } from "@/src/i18n/routing";
import styles from "./page.module.css";

type EventsTableProps = {
  events: AdminEventListEntry[];
  locale: SupportedLocale;
};

function getStateLabel(state: string, t: ReturnType<typeof getAdminCopy>): string {
  if (state === "LIVE") {
    return t.status.live;
  }

  if (state === "SCHEDULED") {
    return t.status.scheduled;
  }

  if (state === "CLOSED") {
    return "Closed";
  }

  return state;
}

export function EventsTable({ events, locale }: EventsTableProps) {
  const router = useRouter();
  const t = getAdminCopy(locale);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startEventNow(id: string): Promise<void> {
    setBusyId(id);
    setError(null);

    try {
      await api.admin.events.startEvent(id);
      router.refresh();
    } catch (startError) {
      setError(getApiErrorMessage(startError, "Unable to start the event right now."));
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
                    {new Date(event.scheduledAt).toLocaleString(toIntlLocale(locale), {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    {event.state === "SCHEDULED" ? <span className="pill pill-sched">{getStateLabel(event.state, t)}</span> : null}
                    {event.state === "LIVE" ? (
                      <span className="pill pill-live">
                        <span className="live-dot" aria-hidden />
                        {getStateLabel(event.state, t)}
                      </span>
                    ) : null}
                    {event.state === "CLOSED" ? <span className="pill">{getStateLabel(event.state, t)}</span> : null}
                  </td>
                  <td>{event.lotsCount}</td>
                  <td>
                    <div className={styles.actions}>
                      {event.state === "SCHEDULED" ? (
                        <Link href={`/admin/events/${event.id}/lots`} className="btn btn-outline btn-sm">
                          Add Lots
                        </Link>
                      ) : null}
                      {event.state === "SCHEDULED" ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === event.id}
                          onClick={() => void startEventNow(event.id)}
                        >
                          {busyId === event.id ? "Starting..." : "Start Now"}
                        </button>
                      ) : null}
                      {event.state === "LIVE" ? (
                        <Link href={`/admin/events/${event.id}/console`} className="btn btn-outline btn-sm">
                          View Console
                        </Link>
                      ) : null}
                      {event.state === "CLOSED" ? (
                        <Link href={`/admin/events/${event.id}/results`} className="btn btn-outline btn-sm">
                          View Results
                        </Link>
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

      {error ? <p className={styles.errorText}>{error}</p> : null}
    </section>
  );
}
