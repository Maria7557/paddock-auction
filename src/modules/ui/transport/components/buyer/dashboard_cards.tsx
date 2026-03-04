import { formatAed, type DashboardReadModel } from "@/src/modules/ui/domain/marketplace_read_model";

type DashboardCardsProps = {
  dashboard: DashboardReadModel;
};

export function DashboardCards({ dashboard }: DashboardCardsProps) {
  return (
    <section className="dashboard-grid" aria-label="Dashboard summary">
      <article className="metric-tile">
        <p>Active bids</p>
        <strong>{dashboard.activeBids}</strong>
      </article>
      <article className="metric-tile">
        <p>Watching</p>
        <strong>{dashboard.watching}</strong>
      </article>
      <article className="metric-tile">
        <p>Invoices due</p>
        <strong>{dashboard.invoicesDue}</strong>
      </article>
      <article className="metric-tile">
        <p>Deposit balance</p>
        <strong>{formatAed(dashboard.depositBalanceAed)}</strong>
      </article>
    </section>
  );
}
