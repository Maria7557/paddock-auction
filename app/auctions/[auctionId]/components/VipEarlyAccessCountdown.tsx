"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./VipEarlyAccessCountdown.module.css";

type Props = {
  targetIso: string;
  locale: "en" | "ru";
};

function formatHourWord(hours: number, locale: "en" | "ru"): string {
  if (locale === "ru") {
    const mod10 = hours % 10;
    const mod100 = hours % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return "час";
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return "часа";
    }

    return "часов";
  }

  return hours === 1 ? "hour" : "hours";
}

export function VipEarlyAccessCountdown({ targetIso, locale }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const value = useMemo(() => {
    const diffMs = new Date(targetIso).getTime() - now;

    if (diffMs <= 0) {
      return { hours: 0, overdue: true };
    }

    return {
      hours: Math.max(1, Math.floor(diffMs / 3_600_000)),
      overdue: false,
    };
  }, [targetIso, now]);
  const text = value.overdue
    ? locale === "ru"
      ? "Завершено"
      : "Ended"
    : locale === "ru"
      ? `Заканчивается через ${value.hours} ${formatHourWord(value.hours, locale)}`
      : `Ends in ${value.hours} ${formatHourWord(value.hours, locale)}`;

  return (
    <span className={styles.countdown} aria-live="polite">
      {text}
    </span>
  );
}
