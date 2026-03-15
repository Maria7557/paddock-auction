import { ProfileLogoutButton } from "@/components/shell/ProfileLogoutButton";
import { readDashboard } from "@/src/modules/ui/domain/marketplace_read_model";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { requireBuyerSession } from "@/src/lib/buyer_session";
import { DashboardCards } from "@/src/modules/ui/transport/components/buyer/dashboard_cards";
import { getBuyerPortalCopy } from "@/src/modules/ui/transport/i18n/buyer_portal_copy";
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
  const session = await requireBuyerSession("/dashboard");
  const locale = await getLocalePreference();
  const t = getBuyerPortalCopy(locale);
  const dashboard = await readDashboard({
    userId: session.userId,
    companyId: session.companyId,
  });

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>{t.pages.dashboardTitle}</h1>
          <p>{t.pages.dashboardSubtitle}</p>
          <div className="inline-actions" style={{ marginTop: "12px" }}>
            <ProfileLogoutButton className="button button-ghost" />
          </div>
        </div>
      </section>

      <DashboardCards dashboard={dashboard} locale={locale} />

      <section className="surface-panel">
        <div className="section-heading compact">
          <h2>{t.pages.recentActivity}</h2>
        </div>
        {dashboard.recentActivity.length === 0 ? (
          <p className="text-muted">{t.pages.noActivity}</p>
        ) : (
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
                  <span>{new Date(item.createdAt).toLocaleString(locale === "ru" ? "ru-RU" : "en-AE")}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </MarketShell>
  );
}
