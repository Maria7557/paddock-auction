import Link from "next/link";

import { formatAed } from "@/src/lib/utils";

import styles from "./DepositCard.module.css";

type DepositCardProps = {
  available: number;
  locked: number;
};

export function DepositCard({ available, locked }: DepositCardProps) {
  const total = available + locked;

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2>Deposit account</h2>
      </div>

      <div className={styles.amountBlock}>
        <strong className={styles.amount}>{formatAed(total)}</strong>
        <span className={styles.refundPill}>Fully refundable within 24 hours</span>
      </div>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Available for bidding</dt>
          <dd>{formatAed(available)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Locked (active auctions)</dt>
          <dd>{formatAed(locked)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Minimum to participate</dt>
          <dd>{formatAed(5000)}</dd>
        </div>
      </dl>

      <Link href="/wallet" className="btn btn-primary btn-full">
        Add funds
      </Link>
    </section>
  );
}
