import type { SupportedLocale } from "@/src/i18n/routing";
import { formatAed, type DashboardReadModel } from "@/src/modules/ui/domain/marketplace_read_model";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";

type DashboardCardsProps = {
  dashboard: DashboardReadModel;
  locale: SupportedLocale;
};

export function DashboardCards({ dashboard, locale }: DashboardCardsProps) {
  const t = getBuyerPortalCopy(locale);

  return (
    <section className="dashboard-grid" aria-label={t.dashboardCards.aria}>
      <article className="metric-tile">
        <p>{t.dashboardCards.activeBids}</p>
        <strong>{dashboard.activeBids}</strong>
      </article>
      <article className="metric-tile">
        <p>{t.dashboardCards.watching}</p>
        <strong>{dashboard.watching}</strong>
      </article>
      <article className="metric-tile">
        <p>{t.dashboardCards.invoicesDue}</p>
        <strong>{dashboard.invoicesDue}</strong>
      </article>
      <article className="metric-tile">
        <p>{t.dashboardCards.depositBalance}</p>
        <strong>{formatAed(dashboard.depositBalanceAed, locale)}</strong>
      </article>
    </section>
  );
}
