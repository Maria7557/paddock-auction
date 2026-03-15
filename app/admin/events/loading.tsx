import { getLocalePreference } from "@/src/lib/display_preferences";

import { getAdminCopy } from "../i18n";
import styles from "./page.module.css";

export default async function LoadingEventsPage() {
  const locale = await getLocalePreference();
  const t = getAdminCopy(locale);

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.skeletonHead} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.events.sectionTitle}</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.events.table.title}</th>
                <th>{t.events.table.dateTime}</th>
                <th>{t.events.table.status}</th>
                <th>{t.events.table.lots}</th>
                <th>{t.events.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((row) => (
                <tr key={row}>
                  <td colSpan={5}>
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
