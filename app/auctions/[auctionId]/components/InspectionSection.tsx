"use client";

import type { SupportedLocale } from "@/src/i18n/routing";
import { toIntlLocale } from "@/src/i18n/routing";

import styles from "./Sections.module.css";

type Props = {
  startsAt: string;
  locale: SupportedLocale;
};

export function InspectionSection({ startsAt, locale }: Props) {
  const isRu = locale === "ru";
  const viewDate = new Date(startsAt);
  const viewEnd = new Date(viewDate.getTime() - 86_400_000);
  const viewStart = new Date(viewDate.getTime() - 2 * 86_400_000);

  return (
    <section className={styles.card} aria-labelledby="ins-heading">
      <h2 id="ins-heading" className={styles.cardTitle}>
        {isRu ? "Инспекция" : "Inspection"}
      </h2>

      <div className={styles.inspectLayout}>
        <div className={styles.inspectInfo}>
          <div className={styles.inspectSubhead}>{isRu ? "Окно просмотра" : "Preview Window"}</div>
          <div className={styles.inspectDates}>
            <strong>{isRu ? "Даты просмотра" : "Viewing Dates"}</strong>
            <p>
              {viewStart.toLocaleDateString(toIntlLocale(locale), { day: "numeric", month: "short" })}
              &nbsp;–&nbsp;
              {viewEnd.toLocaleDateString(toIntlLocale(locale), { day: "numeric", month: "short" })}
            </p>
            <p className={styles.inspectTime}>10:00 – 17:00 GST</p>
            <p className={styles.inspectAddr}>Dubai Warehouse · Al Quoz Industrial Area 2</p>
          </div>
        </div>

        <div className={styles.inspectActions}>
          {/* TEMP(inspection-actions, 2026-03-26): Product requested that this widget show only the scheduled-viewing state. Remove when inspection download/request actions are re-enabled here. */}
          <button
            type="button"
            className={`btn btn-primary ${styles.inspectBtn} ${styles.inspectStatusBtn}`}
            disabled
            aria-pressed={true}
          >
            {isRu ? "Просмотр запланирован" : "Viewing Scheduled"}
          </button>
        </div>
      </div>
    </section>
  );
}
