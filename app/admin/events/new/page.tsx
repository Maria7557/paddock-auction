"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

type CreateEventResponse = {
  id?: string;
  error?: string;
};

export default function NewEventPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createEvent(): Promise<void> {
    if (!title.trim() || !date || !time) {
      setError("Title, date, and start time are required.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title,
          date,
          time,
          description,
        }),
      });

      const payload = (await response.json().catch(() => null)) as CreateEventResponse | null;

      if (!response.ok || !payload?.id) {
        setError(payload?.error ?? "Failed to create event.");
        return;
      }

      router.push(`/admin/events/${payload.id}`);
    } catch {
      setError("Failed to create event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Create Event</h1>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>New Event</div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>Title</div>
          <div className={styles.rowValue}>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly Fleet Auction"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>Date</div>
          <div className={styles.rowValue}>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>Start Time</div>
          <div className={styles.rowValue}>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>Description</div>
          <div className={styles.rowValue}>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Optional event notes"
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
            {busy ? "Creating..." : "Create Event"}
          </button>
        </div>
      </section>

      {error ? <p className={styles.errorText}>{error}</p> : null}
    </section>
  );
}
