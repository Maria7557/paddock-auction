import styles from "./page.module.css";

export default function LoadingVehiclesPage() {
  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.skeletonHead} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Loading vehicles...</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Brand / Model / Year</th>
                <th>VIN</th>
                <th>Status</th>
                <th>Company</th>
                <th>Market Price</th>
                <th>Event</th>
                <th>Actions</th>
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
