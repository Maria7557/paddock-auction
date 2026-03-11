// app/lot/[id]/components/VehicleDesc.tsx

import styles from './Sections.module.css';

type Props = { description: string; highlights: string[] };

export function VehicleDesc({ description, highlights }: Props) {
  return (
    <section className={styles.card} aria-labelledby="vd-heading">
      <h2 id="vd-heading" className={styles.cardTitle}>Vehicle Description</h2>
      <p className={styles.descText}>{description}</p>
      {highlights.length > 0 && (
        <>
          <div className={styles.highlightHeading}>Highlights</div>
          <ul className={styles.highlightList} role="list">
            {highlights.map((h) => (
              <li key={h} className={styles.highlightItem}>
                <span className={styles.checkGreen} aria-hidden>✓</span>
                {h}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
