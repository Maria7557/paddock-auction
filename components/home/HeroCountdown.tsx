"use client";

import { useEffect, useState } from "react";

import type { SupportedLocale } from "@/src/i18n/routing";
import { formatCountdown, pad } from "@/src/lib/utils";

import styles from "./HeroSection.module.css";

export default function HeroCountdown({ endsAt, locale = "en" }: { endsAt: string; locale?: SupportedLocale }) {
  const [cd, setCd] = useState(() => formatCountdown(new Date(endsAt).getTime() - Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      setCd(formatCountdown(new Date(endsAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const labels =
    locale === "ru"
      ? { hours: "Часы", minutes: "Минуты", seconds: "Секунды" }
      : { hours: "Hours", minutes: "Minutes", seconds: "Seconds" };

  return (
    <div className={styles.footer}>
      <div className={styles.footerCell}>
        <div className={styles.footerVal}>{pad(cd.hours)}</div>
        <div className={styles.footerLbl}>{labels.hours}</div>
      </div>
      <div className={styles.footerCell}>
        <div className={styles.footerVal}>{pad(cd.minutes)}</div>
        <div className={styles.footerLbl}>{labels.minutes}</div>
      </div>
      <div className={styles.footerCell}>
        <div className={styles.footerVal}>{pad(cd.seconds)}</div>
        <div className={styles.footerLbl}>{labels.seconds}</div>
      </div>
    </div>
  );
}
