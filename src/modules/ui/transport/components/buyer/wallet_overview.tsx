import Link from "next/link";

import type { SupportedLocale } from "@/src/i18n/routing";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
import { formatAed, formatShortDateTime, type WalletReadModel } from "@/src/modules/ui/domain/marketplace_read_model";

type WalletOverviewProps = {
  wallet: WalletReadModel;
  locale: SupportedLocale;
};

export function WalletOverview({ wallet, locale }: WalletOverviewProps) {
  const t = getBuyerPortalCopy(locale);

  return (
    <section className="wallet-layout">
      <div className="wallet-balances">
        <article>
          <p>{t.wallet.availableBalance}</p>
          <strong>{formatAed(wallet.availableBalanceAed, locale)}</strong>
        </article>
        <article>
          <p>{t.wallet.lockedBalance}</p>
          <strong>{formatAed(wallet.lockedBalanceAed, locale)}</strong>
        </article>
        <article>
          <p>{t.wallet.pendingWithdrawal}</p>
          <strong>{formatAed(wallet.pendingWithdrawalAed, locale)}</strong>
        </article>
      </div>

      <div className="inline-actions">
        <button type="button" className="button button-primary">
          {t.wallet.addFunds}
        </button>
        <button type="button" className="button button-ghost">
          {t.wallet.withdraw}
        </button>
      </div>

      <p className="wallet-note">{t.wallet.activeLockNote}</p>

      <section className="surface-panel">
        <h2>{t.wallet.activeLocks}</h2>
        <ul className="simple-list">
          {wallet.activeLocks.map((lock) => (
            <li key={lock.lockId}>
              <div>
                <p>{lock.lotNumber}</p>
                <p className="text-muted">{t.wallet.lockStatuses[lock.status]}</p>
              </div>
              <strong>{formatAed(lock.amountAed, locale)}</strong>
            </li>
          ))}
        </ul>
      </section>

      <details className="surface-panel tx-history">
        <summary>{t.wallet.transactionHistory}</summary>
        <ul className="simple-list">
          {wallet.transactions.map((tx) => (
            <li key={tx.id}>
              <div>
                <p>{tx.note}</p>
                <p className="text-muted">{formatShortDateTime(tx.createdAt, locale)}</p>
              </div>
              <strong>{formatAed(tx.amountAed, locale)}</strong>
            </li>
          ))}
        </ul>
        <Link href="/finance" className="inline-link">
          {t.wallet.openPaymentPendingView}
        </Link>
      </details>
    </section>
  );
}
