"use client";

import { useEffect, useState } from "react";

import type { SupportedLocale } from "@/src/i18n/routing";
import { formatCountdown, pad } from "@/src/lib/utils";

import styles from "./HeroSection.module.css";

interface HeroCountdownProps {
  targetAt: string;
  locale?: SupportedLocale;
}

export default function HeroCountdown({ targetAt, locale = "en" }: HeroCountdownProps) {
  const targetMs = new Date(targetAt).getTime();
  const [cd, setCd] = useState(() => formatCountdown(targetMs - Date.now()));

  useEffect(() => {
    const updateCountdown = () => {
      setCd(formatCountdown(targetMs - Date.now()));
    };

    updateCountdown();

    const timer = setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => clearInterval(timer);
  }, [targetMs]);

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
