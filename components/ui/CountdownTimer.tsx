"use client";

import { useEffect, useMemo, useState } from "react";

export type CountdownTimerProps = {
  targetIso: string;
  prefix?: string;
  overdueLabel?: string;
  className?: string;
};

type CountdownValue = {
  text: string;
  overdue: boolean;
};

export function formatCountdown(targetIso: string, now: number): CountdownValue {
  const diffMs = new Date(targetIso).getTime() - now;

  if (diffMs <= 0) {
    return { text: "00h 00m 00s", overdue: true };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    text: `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`,
    overdue: false,
  };
}

export function CountdownTimer({
  targetIso,
  prefix,
  overdueLabel = "Ended",
  className,
}: CountdownTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const value = useMemo(() => formatCountdown(targetIso, now), [targetIso, now]);

  return (
    <p className={className}>
      {prefix ? <span>{prefix} </span> : null}
      <strong>{value.overdue ? overdueLabel : value.text}</strong>
    </p>
  );
}
