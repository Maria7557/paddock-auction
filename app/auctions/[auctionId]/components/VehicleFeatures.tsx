import type { SupportedLocale } from "@/src/i18n/routing";

import styles from "./Sections.module.css";

export function VehicleFeatures({ features, locale }: { features: string[]; locale: SupportedLocale }) {
  if (!features.length) {
    return null;
  }

  return (
    <section className={styles.card} aria-labelledby="vf-heading">
      <h2 id="vf-heading" className={styles.cardTitle}>
        {locale === "ru" ? "Оснащение" : "Vehicle Features"}
      </h2>
      <ul className={styles.featureGrid} role="list">
        {features.map((feature) => (
          <li key={feature} className={styles.featureItem}>
            <span className={styles.featureTick} aria-hidden>
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
    </section>
  );
}
