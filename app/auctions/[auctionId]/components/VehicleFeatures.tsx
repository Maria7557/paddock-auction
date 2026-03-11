// app/lot/[id]/components/VehicleFeatures.tsx

import styles from './Sections.module.css';

export function VehicleFeatures({ features }: { features: string[] }) {
  if (!features.length) return null;
  return (
    <section className={styles.card} aria-labelledby="vf-heading">
      <h2 id="vf-heading" className={styles.cardTitle}>Vehicle Features</h2>
      <ul className={styles.featureGrid} role="list">
        {features.map((f) => (
          <li key={f} className={styles.featureItem}>
            <span className={styles.featureTick} aria-hidden>✓</span>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}
