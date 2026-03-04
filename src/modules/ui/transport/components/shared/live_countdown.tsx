"use client";

import { useEffect, useMemo, useState } from "react";

type LiveCountdownProps = {
  targetIso: string;
  prefix?: string;
  overdueLabel?: string;
  className?: string;
};

function formatCountdown(targetIso: string, now: number): { text: string; overdue: boolean } {
  const diffMs = new Date(targetIso).getTime() - now;

  if (diffMs <= 0) {
    return { text: "00h 00m 00s", overdue: true };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  return {
    text: `${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`,
    overdue: false,
  };
}

export function LiveCountdown({
  targetIso,
  prefix,
  overdueLabel = "Ended",
  className,
}: LiveCountdownProps) {
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
