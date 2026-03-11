import styles from "./page.module.css";

export default function LoadingBuyersPage() {
  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.skeletonHead} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Loading buyers...</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Company</th>
                <th>Deposit Status</th>
                <th>Amount</th>
                <th>Actions</th>
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
