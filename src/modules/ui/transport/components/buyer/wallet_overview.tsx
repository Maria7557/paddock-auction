import Link from "next/link";

import { formatAed, formatShortDateTime, type WalletReadModel } from "@/src/modules/ui/domain/marketplace_read_model";

type WalletOverviewProps = {
  wallet: WalletReadModel;
};

export function WalletOverview({ wallet }: WalletOverviewProps) {
  return (
    <section className="wallet-layout">
      <div className="wallet-balances">
        <article>
          <p>Available balance</p>
          <strong>{formatAed(wallet.availableBalanceAed)}</strong>
        </article>
        <article>
          <p>Locked balance</p>
          <strong>{formatAed(wallet.lockedBalanceAed)}</strong>
        </article>
        <article>
          <p>Pending withdrawal</p>
          <strong>{formatAed(wallet.pendingWithdrawalAed)}</strong>
        </article>
      </div>

      <div className="inline-actions">
        <button type="button" className="button button-primary">
          Add Funds
        </button>
        <button type="button" className="button button-ghost">
          Withdraw
        </button>
      </div>

      <p className="wallet-note">Active auction participation locks deposit temporarily.</p>

      <section className="surface-panel">
        <h2>Active locks</h2>
        <ul className="simple-list">
          {wallet.activeLocks.map((lock) => (
            <li key={lock.lockId}>
              <div>
                <p>{lock.lotNumber}</p>
                <p className="text-muted">{lock.status}</p>
              </div>
              <strong>{formatAed(lock.amountAed)}</strong>
            </li>
          ))}
        </ul>
      </section>

      <details className="surface-panel tx-history">
        <summary>Transaction history</summary>
        <ul className="simple-list">
          {wallet.transactions.map((tx) => (
            <li key={tx.id}>
              <div>
                <p>{tx.note}</p>
                <p className="text-muted">{formatShortDateTime(tx.createdAt)}</p>
              </div>
              <strong>{formatAed(tx.amountAed)}</strong>
            </li>
          ))}
        </ul>
        <Link href="/finance" className="inline-link">
          Open payment pending view
        </Link>
      </details>
    </section>
  );
}
