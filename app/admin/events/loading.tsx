import styles from "./page.module.css";

export default function LoadingEventsPage() {
  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div style={{ width: 180, height: 36, borderRadius: 10, background: "var(--bg-subtle)" }} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Loading events...</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Date & Time</th>
                <th>Status</th>
                <th>Lots</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((row) => (
                <tr key={row}>
                  <td colSpan={5}>
                    <div style={{ height: 14, width: "100%", borderRadius: 8, background: "var(--bg-subtle)" }} />
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
