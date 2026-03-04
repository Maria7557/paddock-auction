"use client";

import { CountdownTimer, type CountdownTimerProps } from "@/components/ui/CountdownTimer";

export type LiveCountdownProps = CountdownTimerProps;

export function LiveCountdown(props: LiveCountdownProps) {
  return <CountdownTimer {...props} />;
}
