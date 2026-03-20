"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getAdminCopy } from "@/app/admin/i18n";
import type { SupportedLocale } from "@/src/i18n/routing";
import { api, getApiErrorMessage } from "@/src/lib/api-client";

import styles from "./page.module.css";

type NewEventFormProps = {
  locale: SupportedLocale;
};

export function NewEventForm({ locale }: NewEventFormProps) {
  const router = useRouter();
  const t = getAdminCopy(locale);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createEvent(): Promise<void> {
    if (!title.trim() || !date || !startTime) {
      setError(t.newEvent.errors.requiredFields);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload = await api.admin.events.create<{ id?: string }>({
        title,
        date,
        startTime,
        description,
      });

      if (!payload?.id) {
        setError(t.newEvent.errors.createFailed);
        return;
      }

      router.push(`/admin/events/${payload.id}/lots`);
    } catch (error) {
      setError(getApiErrorMessage(error, t.newEvent.errors.createFailed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>{t.newEvent.heading}</h1>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.newEvent.sectionTitle}</div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>{t.newEvent.fields.title}</div>
          <div className={styles.rowValue}>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t.newEvent.placeholders.title}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>{t.newEvent.fields.date}</div>
          <div className={styles.rowValue}>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>{t.newEvent.fields.startTime}</div>
          <div className={styles.rowValue}>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>{t.newEvent.fields.description}</div>
          <div className={styles.rowValue}>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder={t.newEvent.placeholders.description}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void createEvent()}
            disabled={busy}
          >
            {busy ? t.newEvent.actions.creating : t.newEvent.actions.create}
          </button>
        </div>
      </section>

      {error ? <p className={styles.errorText}>{error}</p> : null}
    </section>
  );
}
