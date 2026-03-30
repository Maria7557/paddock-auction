"use client";

import { useMemo, useState } from "react";

import type { SupportedLocale } from "@/src/i18n/routing";
import { toIntlLocale } from "@/src/i18n/routing";

import styles from "./Sections.module.css";

type Props = {
  auctionId: string;
  startsAt: string;
  location: string;
  locale: SupportedLocale;
};

export function InspectionSection({ auctionId, startsAt, location, locale }: Props) {
  const [requested, setRequested] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const isRu = locale === "ru";
  const viewWindow = useMemo(() => {
    const openingDate = new Date(startsAt);
    const viewEnd = new Date(openingDate.getTime() - 86_400_000);
    const viewStart = new Date(openingDate.getTime() - 2 * 86_400_000);

    return {
      from: viewStart.toLocaleDateString(toIntlLocale(locale), {
        day: "numeric",
        month: "short",
      }),
      to: viewEnd.toLocaleDateString(toIntlLocale(locale), {
        day: "numeric",
        month: "short",
      }),
    };
  }, [locale, startsAt]);

  return (
    <section className={styles.section} aria-labelledby="inspection-title">
      <div className={styles.sectionHeader}>
        <h2 id="inspection-title" className={styles.sectionTitle}>
          {isRu ? "Инспекция и просмотр" : "Inspection & viewing"}
        </h2>
      </div>

      <div className={styles.inspectionLayout}>
        <div className={styles.inspectionMeta}>
          <span className={styles.inspectionEyebrow}>{isRu ? "Окно просмотра" : "Preview window"}</span>
          <p className={styles.inspectionTitle}>
            {viewWindow.from} - {viewWindow.to}
          </p>
          <p className={styles.inspectionText}>10:00 - 17:00 GST</p>
          <p className={styles.inspectionText}>{location || "Dubai Warehouse · Al Quoz Industrial Area 2"}</p>
        </div>

        <div className={styles.inspectionActions}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
            onClick={() => window.open(`/api/auctions/${auctionId}/inspection-report`, "_blank")}
          >
            {isRu ? "Скачать отчёт инспекции" : "Download inspection report"}
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={() => setRequested(true)}
            disabled={requested}
          >
            {requested ? (isRu ? "Запрос отправлен" : "Inspection requested") : isRu ? "Запросить инспекцию" : "Request inspection"}
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={() => setScheduled(true)}
            disabled={scheduled}
          >
            {scheduled ? (isRu ? "Просмотр назначен" : "Viewing scheduled") : isRu ? "Запланировать просмотр" : "Schedule viewing"}
          </button>
        </div>
      </div>
    </section>
  );
}
