import type { AuctionWeekEvent } from "@/src/types/auction";
import { formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";
import { toIntlLocale } from "@/src/i18n/routing";

import styles from "./AuctionTicker.module.css";

interface Props {
  event: AuctionWeekEvent;
  display?: DisplaySettings;
}

const DEFAULT_DISPLAY: DisplaySettings = {
  locale: "en",
  currency: "AED",
  usdPerAed: 1 / 3.6725,
};

export default function AuctionTicker({ event, display = DEFAULT_DISPLAY }: Props) {
  const isRu = display.locale === "ru";
  const intlLocale = toIntlLocale(display.locale);
  const date = new Date(event.date);
  const isLive = event.status === "LIVE";

  const dateStr = date.toLocaleDateString(intlLocale, {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString(intlLocale, {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
  });

  const segments = [
    isLive
      ? isRu
        ? `Живой аукцион до: ${dateStr} — ${timeStr} GST`
        : `Live Auction Ends: ${dateStr} — ${timeStr} GST`
      : isRu
        ? `Следующий аукцион: ${dateStr} — ${timeStr} GST`
        : `Next Auction: ${dateStr} — ${timeStr} GST`,
    isRu ? `${formatInteger(event.lotCount, display.locale)} лотов подтверждено` : `${formatInteger(event.lotCount, display.locale)} lots confirmed`,
    event.location,
    `${isRu ? "Старт от " : "Starting from "}${formatMoneyFromAed(event.startingFromAed, display)}`,
  ].filter((segment): segment is string => Boolean(segment));

  const item = (
    <div className={styles.item}>
      <span className={styles.livePill}>
        {isLive ? (
          <>
            <span className="live-dot" />
            LIVE
          </>
        ) : (
          isRu ? "Скоро" : "Scheduled"
        )}
      </span>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`}>
          {index === 0 ? <strong>{segment}</strong> : segment}
          {index < segments.length - 1 ? <span className={styles.sep}>·</span> : null}
        </span>
      ))}
    </div>
  );

  return (
    <div className={styles.bar}>
      <div className={styles.track}>
        {item}
        {item}
      </div>
    </div>
  );
}
