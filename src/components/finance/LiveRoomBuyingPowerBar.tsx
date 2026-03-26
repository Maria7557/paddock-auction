"use client";

import { useEffect, useState } from "react";

import { api, type BuyerBuyingPowerResponse } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./LiveRoomBuyingPowerBar.module.css";

type LiveRoomBuyingPowerState = {
  remaining: number;
  ceiling: number;
};

function toMoneyNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function LiveRoomBuyingPowerBar() {
  const [buyingPower, setBuyingPower] = useState<LiveRoomBuyingPowerState | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBuyingPower(): Promise<void> {
      try {
        const payload = await api.buyer.buyingPower<BuyerBuyingPowerResponse>({
          cache: "no-store",
        });

        if (!active) {
          return;
        }

        const depositAmount = toMoneyNumber(payload.depositAmount);
        const ceiling = Math.max(0, toMoneyNumber(payload.ceiling));
        const remaining = Math.max(0, toMoneyNumber(payload.remaining));

        if (depositAmount <= 0 || ceiling <= 0) {
          setBuyingPower(null);
          return;
        }

        setBuyingPower({
          remaining,
          ceiling,
        });
      } catch {
        if (active) {
          setBuyingPower(null);
        }
      }
    }

    void loadBuyingPower();

    return () => {
      active = false;
    };
  }, []);

  if (!buyingPower) {
    return null;
  }

  return (
    <div className={styles.bar}>
      {`Your bidding limit: ${formatAed(buyingPower.ceiling)} · ${formatAed(buyingPower.remaining)} available at auction start`}
    </div>
  );
}
