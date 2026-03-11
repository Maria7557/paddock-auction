"use client";

import { Fragment, useEffect, useState } from "react";

import type { SupportedLocale } from "@/src/i18n/routing";
import { formatCountdown, pad } from "@/src/lib/utils";

import styles from "./HomeSections.module.css";

export default function WeekCountdown({ auctionDate, locale = "en" }: { auctionDate: string; locale?: SupportedLocale }) {
  const [cd, setCd] = useState(() => formatCountdown(new Date(auctionDate).getTime() - Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      setCd(formatCountdown(new Date(auctionDate).getTime() - Date.now()));
    }, 1000);

    return () => clearInterval(timer);
  }, [auctionDate]);

  const isRu = locale === "ru";

  return (
    <div className={styles.cdBlock}>
      <div className={styles.cdLabel}>{isRu ? "До старта аукциона" : "Auction Starts In"}</div>
      <div className={styles.cdUnits}>
        {[
          { val: cd.days, lbl: isRu ? "Дни" : "Days" },
          { val: cd.hours, lbl: isRu ? "Часы" : "Hours" },
          { val: cd.minutes, lbl: isRu ? "Мин" : "Min" },
          { val: cd.seconds, lbl: isRu ? "Сек" : "Sec" },
        ].map(({ val, lbl }, index) => (
          <Fragment key={lbl}>
            {index > 0 && (
              <div key={`sep-${index}`} className={styles.cdSep}>
                :
              </div>
            )}
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(val)}</div>
              <div className={styles.cdUnitLbl}>{lbl}</div>
            </div>
          </Fragment>
        ))}
      </div>
      <div className={styles.cdInfo}>
        <div className={styles.cdInfoLbl}>{isRu ? "Окно просмотра" : "Viewing Slots"}</div>
        <div className={styles.cdInfoRow}>{isRu ? "Вт, 4 марта · 10:00 – 17:00" : "Tue 4 March · 10:00 – 17:00"}</div>
        <div className={styles.cdInfoRow}>{isRu ? "Ср, 5 марта · 10:00 – 17:00" : "Wed 5 March · 10:00 – 17:00"}</div>
        <a href="/register?action=inspection" className={`btn btn-ghost-white btn-sm btn-full ${styles.cdCta}`}>
          {isRu ? "Забронировать слот осмотра" : "Book Inspection Slot"}
        </a>
      </div>
    </div>
  );
}
