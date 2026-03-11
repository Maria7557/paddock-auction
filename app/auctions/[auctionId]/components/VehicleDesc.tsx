import type { SupportedLocale } from "@/src/i18n/routing";

import styles from "./Sections.module.css";

type Props = {
  description: string;
  highlights: string[];
  locale: SupportedLocale;
};

export function VehicleDesc({ description, highlights, locale }: Props) {
  const isRu = locale === "ru";

  return (
    <section className={styles.card} aria-labelledby="vd-heading">
      <h2 id="vd-heading" className={styles.cardTitle}>
        {isRu ? "Описание автомобиля" : "Vehicle Description"}
      </h2>
      <p className={styles.descText}>{description}</p>
      {highlights.length > 0 && (
        <>
          <div className={styles.highlightHeading}>{isRu ? "Ключевые пункты" : "Highlights"}</div>
          <ul className={styles.highlightList} role="list">
            {highlights.map((highlight) => (
              <li key={highlight} className={styles.highlightItem}>
                <span className={styles.checkGreen} aria-hidden>
                  ✓
                </span>
                {highlight}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
