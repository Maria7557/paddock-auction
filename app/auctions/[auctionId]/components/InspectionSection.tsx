"use client";

import { useState } from "react";

import type { SupportedLocale } from "@/src/i18n/routing";
import { toIntlLocale } from "@/src/i18n/routing";

import styles from "./Sections.module.css";

type Props = {
  auctionId: string;
  startsAt: string;
  locale: SupportedLocale;
};

export function InspectionSection({ auctionId, startsAt, locale }: Props) {
  const [requested, setRequested] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  const isRu = locale === "ru";
  const viewDate = new Date(startsAt);
  const viewEnd = new Date(viewDate.getTime() - 86_400_000);
  const viewStart = new Date(viewDate.getTime() - 2 * 86_400_000);

  const handleDownload = () => {
    window.open(`/api/auctions/${auctionId}/inspection-report`, "_blank");
  };
  const handleRequest = () => setRequested(true);
  const handleSchedule = () => setScheduled(true);

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
          <button className={`btn btn-primary ${styles.inspectBtn}`} onClick={handleDownload}>
            {isRu ? "Скачать отчёт инспекции" : "Download Inspection Report"}
          </button>

          <button
            className={`btn btn-outline ${styles.inspectBtn}`}
            onClick={handleRequest}
            disabled={requested}
            aria-pressed={requested}
          >
            {requested ? (isRu ? "Запрос отправлен" : "Inspection Requested") : isRu ? "Запросить инспекцию" : "Request Inspection"}
          </button>

          <button
            className={`btn btn-outline ${styles.inspectBtn}`}
            onClick={handleSchedule}
            disabled={scheduled}
            aria-pressed={scheduled}
          >
            {scheduled ? (isRu ? "Просмотр запланирован" : "Viewing Scheduled") : isRu ? "Запланировать просмотр" : "Schedule Viewing"}
          </button>
        </div>
      </div>
    </section>
  );
}
