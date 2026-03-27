import type { CSSProperties } from "react";

import { formatAed } from "@/src/lib/utils";

import styles from "./BuyingPowerBar.module.css";

type BuyingPowerBarProps = {
  activeBidsTotal: number;
  ceiling: number;
  remaining: number;
};

export function BuyingPowerBar({
  activeBidsTotal,
  ceiling,
  remaining,
}: BuyingPowerBarProps) {
  const safeActiveBidsTotal = Math.max(0, activeBidsTotal);
  const safeCeiling = Math.max(0, ceiling);
  const safeRemaining = Math.max(0, remaining);
  const progressPercent =
    safeCeiling > 0 ? Math.min(100, (safeActiveBidsTotal / safeCeiling) * 100) : 0;
  const progressStyle = {
    "--progress-value": `${progressPercent}%`,
  } as CSSProperties;

  return (
    <div className={styles.bar}>
      <div className={styles.header}>
        <span className={styles.label}>
          {`${formatAed(safeActiveBidsTotal)} used of ${formatAed(safeCeiling)}`}
        </span>
        <span className={styles.remaining}>
          {`${formatAed(safeRemaining)} available for bidding`}
        </span>
      </div>

      <div className={styles.track} aria-hidden>
        <div className={styles.fill} style={progressStyle} />
      </div>

      {safeActiveBidsTotal === 0 ? (
        <span className={styles.note}>Fully refundable while you have no active bids</span>
      ) : null}
    </div>
  );
}
