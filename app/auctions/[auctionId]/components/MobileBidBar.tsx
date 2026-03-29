"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { withLocalePath } from "@/src/i18n/routing";
import { isScheduledWithoutBids } from "@/src/lib/auction-display";
import type { DisplaySettings } from "@/src/lib/money";
import { formatAed, formatCountdown, pad } from "@/src/lib/utils";

import styles from "./MobileBidBar.module.css";

type Props = {
  auctionId: string;
  state: string;
  currentBidAed: number;
  targetAt: string;
  display: DisplaySettings;
};

export function MobileBidBar({ auctionId, state, currentBidAed, targetAt, display }: Props) {
  const isLive = state === "LIVE" || state === "EXTENDED";
  const isRu = display.locale === "ru";
  const hidePrice = isScheduledWithoutBids(state, currentBidAed);

  const [cd, setCd] = useState(() => formatCountdown(new Date(targetAt).getTime() - Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      setCd(formatCountdown(new Date(targetAt).getTime() - Date.now()));
    }, 1_000);

    return () => clearInterval(timer);
  }, [targetAt]);

  return (
    <div className={styles.bar} role="complementary" aria-label={isRu ? "Быстрая ставка" : "Quick bid"}>
      <div className={styles.info}>
        <div className={styles.price}>
          {hidePrice ? (isRu ? "Pre-Bid" : "Pre-Bid") : formatAed(currentBidAed)}
        </div>
        <div className={styles.cd}>
          {isLive ? (isRu ? "Конец через" : "Ends") : isRu ? "Старт через" : "Starts"}&nbsp;
          {cd.days > 0 ? `${cd.days}d ` : ""}
          {pad(cd.hours)}:{pad(cd.minutes)}:{pad(cd.seconds)}
        </div>
      </div>

      <Link href={`${withLocalePath(`/auctions/${auctionId}`, display.locale)}#bid-panel`} className={`btn btn-primary ${styles.cta}`} scroll={false}>
        {isLive ? (isRu ? "Сделать ставку" : "Bid Now") : isRu ? "Пред-ставка" : "Pre-Bid"}
      </Link>
    </div>
  );
}
