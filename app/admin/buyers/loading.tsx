import { getLocalePreference } from "@/src/lib/display_preferences";

import { getAdminCopy } from "../i18n";
import styles from "./page.module.css";

export default async function LoadingBuyersPage() {
  const locale = await getLocalePreference();
  const t = getAdminCopy(locale);

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.skeletonHead} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t.buyers.sectionTitle}</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.buyers.table.name}</th>
                <th>{t.buyers.table.phone}</th>
                <th>{t.buyers.table.email}</th>
                <th>{t.buyers.table.accountStatus}</th>
                <th>{t.buyers.table.depositStatus}</th>
                <th>{t.buyers.table.registrationDate}</th>
                <th>{t.buyers.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((row) => (
                <tr key={row}>
                  <td colSpan={7}>
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
