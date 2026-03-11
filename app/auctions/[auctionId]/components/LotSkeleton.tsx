// app/lot/[id]/components/LotSkeleton.tsx
// Shown via Suspense while lot data is loading

import styles from './LotSkeleton.module.css';

export function LotSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading lot…">
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <span className={`${styles.sk} ${styles.skW80}`} />
        <span className={`${styles.sk} ${styles.skW120}`} />
        <span className={`${styles.sk} ${styles.skW160}`} />
      </div>

      {/* Title */}
      <div className={styles.titleBlock}>
        <span className={`${styles.sk} ${styles.skW200} ${styles.skH16}`} />
        <span className={`${styles.sk} ${styles.skW340} ${styles.skH32}`} />
        <span className={`${styles.sk} ${styles.skW260} ${styles.skH14}`} />
      </div>

      {/* Hero 2-col */}
      <div className={styles.hero}>
        <div className={`${styles.sk} ${styles.skGallery}`} />
        <div className={`${styles.sk} ${styles.skPanel}`} />
      </div>

      {/* Cards */}
      <div className={styles.cards}>
        {[1, 2, 3].map((n) => (
          <div key={n} className={`${styles.sk} ${styles.skCard}`} />
        ))}
      </div>
    </div>
  );
}
