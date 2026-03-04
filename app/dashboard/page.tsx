import { readDashboard } from "@/src/modules/ui/domain/marketplace_read_model";
import { DashboardCards } from "@/src/modules/ui/transport/components/buyer/dashboard_cards";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";
import { BadgeCheck, CircleAlert, ReceiptText } from "lucide-react";

function resolveActivityIcon(title: string) {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("outbid")) {
    return CircleAlert;
  }

  if (normalizedTitle.includes("accepted")) {
    return BadgeCheck;
  }

  return ReceiptText;
}

export default async function DashboardPage() {
  const dashboard = await readDashboard();

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>Buyer dashboard</h1>
          <p>Track active bidding, watchlist demand, and upcoming payment actions.</p>
        </div>
      </section>

      <DashboardCards dashboard={dashboard} />

      <section className="surface-panel">
        <div className="section-heading compact">
          <h2>Recent activity</h2>
        </div>
        <ul className="timeline-list-v2">
          {dashboard.recentActivity.map((item) => {
            const Icon = resolveActivityIcon(item.title);

            return (
              <li key={item.id}>
                <p>
                  <span className="structural-row">
                    <Icon className="structural-icon" size={18} aria-hidden="true" />
                    <strong>{item.title}</strong>
                  </span>
                </p>
                <p>{item.detail}</p>
                <span>{new Date(item.createdAt).toLocaleString("en-AE")}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </MarketShell>
  );
}
