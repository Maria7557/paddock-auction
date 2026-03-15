import { getLocalePreference } from "@/src/lib/display_preferences";

import { getAdminCopy } from "../i18n";
import styles from "./page.module.css";

export default async function LoadingCompaniesPage() {
  const locale = await getLocalePreference();
  const t = getAdminCopy(locale);

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.skeletonHead} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.companies.sectionTitle}</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.companies.table.company}</th>
                <th>{t.companies.table.email}</th>
                <th>{t.companies.table.phone}</th>
                <th>{t.companies.table.status}</th>
                <th>{t.companies.table.registrationDate}</th>
                <th>{t.companies.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((row) => (
                <tr key={row}>
                  <td colSpan={6}>
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
