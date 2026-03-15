"use client";

import { useEffect, useState } from "react";

import type { SupportedLocale } from "@/src/i18n/routing";
import { formatCountdown, pad } from "@/src/lib/utils";

import styles from "./HeroSection.module.css";

interface HeroCountdownProps {
  endsAt: string;
  locale?: SupportedLocale;
  initialNowMs: number;
}

export default function HeroCountdown({ endsAt, locale = "en", initialNowMs }: HeroCountdownProps) {
  const endsAtMs = new Date(endsAt).getTime();
  const [cd, setCd] = useState(() => formatCountdown(endsAtMs - initialNowMs));

  useEffect(() => {
    const updateCountdown = () => {
      setCd(formatCountdown(endsAtMs - Date.now()));
    };

    updateCountdown();

    const timer = setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => clearInterval(timer);
  }, [endsAtMs]);

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
