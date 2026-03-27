import Link from "next/link";

import { BuyingPowerBar } from "@/src/components/finance/BuyingPowerBar";
import type { BuyerBuyingPowerResponse } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./DepositCard.module.css";

type DepositCardProps = {
  buyingPower: BuyerBuyingPowerResponse;
};

function toMoneyNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function DepositCard({ buyingPower }: DepositCardProps) {
  const depositAmount = toMoneyNumber(buyingPower.depositAmount);
  const ceiling = toMoneyNumber(buyingPower.ceiling);
  const activeBidsTotal = toMoneyNumber(buyingPower.activeBidsTotal);
  const remaining = toMoneyNumber(buyingPower.remaining);

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2>BUYING POWER</h2>
        <p>{`${formatAed(depositAmount)} deposit unlocks ${formatAed(ceiling)} across your active auctions.`}</p>
      </div>

      <BuyingPowerBar
        activeBidsTotal={activeBidsTotal}
        ceiling={ceiling}
        remaining={remaining}
      />

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Deposit secured</dt>
          <dd>{formatAed(depositAmount)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Active bids total</dt>
          <dd>{formatAed(activeBidsTotal)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Buying power ceiling</dt>
          <dd>{formatAed(ceiling)}</dd>
        </div>
      </dl>

      {buyingPower.activeBids.length > 0 ? (
        <div className={styles.activeBidsBlock}>
          <div className={styles.activeBidsTitle}>Active bids</div>
          <ul className={styles.activeBidsList}>
            {buyingPower.activeBids.map((bid) => (
              <li key={`${bid.auctionId}-${bid.amount}`} className={styles.activeBidsItem}>
                <span>{bid.lotTitle}</span>
                <strong>{formatAed(toMoneyNumber(bid.amount))}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link href="/wallet" className="btn btn-primary btn-full">
        Add funds
      </Link>
    </section>
  );
}
