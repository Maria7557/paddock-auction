export function formatAed(amount: number): string {
  return 'AED ' + amount.toLocaleString('en-US');
}

export function savingPct(market: number, current: number): number {
  if (!market || market <= current) return 0;
  return Math.round(((market - current) / market) * 100);
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatCountdown(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days:    Math.floor(total / 86400),
    hours:   Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
