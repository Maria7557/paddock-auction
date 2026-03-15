import { getLocalePreference } from "@/src/lib/display_preferences";

import { getAdminCopy } from "../i18n";
import styles from "./page.module.css";

export default async function LoadingVehiclesPage() {
  const locale = await getLocalePreference();
  const t = getAdminCopy(locale);

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.skeletonHead} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.vehicles.sectionTitle}</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.vehicles.table.photo}</th>
                <th>{t.vehicles.table.vehicle}</th>
                <th>{t.vehicles.table.vin}</th>
                <th>{t.vehicles.table.status}</th>
                <th>{t.vehicles.table.company}</th>
                <th>{t.vehicles.table.marketPrice}</th>
                <th>{t.vehicles.table.event}</th>
                <th>{t.vehicles.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((row) => (
                <tr key={row}>
                  <td colSpan={8}>
                    <div className={styles.skeletonLine} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
