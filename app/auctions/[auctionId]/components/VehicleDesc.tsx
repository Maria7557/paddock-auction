import type { SupportedLocale } from "@/src/i18n/routing";

import type { LotDetail } from "../types";
import styles from "./Sections.module.css";

type Props = {
  lot: LotDetail;
  locale: SupportedLocale;
};

export function VehicleDesc({ lot, locale }: Props) {
  const isRu = locale === "ru";
  const leftRows = [
    { label: isRu ? "Кузов" : "Body style", value: lot.bodyStyle },
    { label: isRu ? "Двигатель" : "Engine", value: lot.engine },
    { label: isRu ? "Трансмиссия" : "Transmission", value: lot.transmission },
    { label: isRu ? "Привод" : "Drive line", value: lot.driveType },
    { label: isRu ? "Топливо" : "Fuel type", value: lot.fuelType },
  ];
  const rightRows = [
    { label: isRu ? "Цилиндры" : "Cylinders", value: lot.cylinders },
    { label: isRu ? "Серия / trim" : "Series / trim", value: lot.series || "—" },
    { label: isRu ? "Год модели" : "Model year", value: String(lot.year) },
    { label: isRu ? "Класс" : "Vehicle class", value: lot.vehicleClass },
    { label: isRu ? "Тип убытка" : "Loss type", value: lot.lossType },
  ];

  return (
    <section className={styles.section} aria-labelledby="vehicle-description-title">
      <div className={styles.sectionHeader}>
        <h2 id="vehicle-description-title" className={styles.sectionTitle}>
          {isRu ? "Описание автомобиля" : "Vehicle description"}
        </h2>
      </div>

      <div className={styles.descriptionGrid}>
        <div className={styles.infoColumn}>
          {leftRows.map((row) => (
            <div key={row.label} className={styles.infoRow}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span className={styles.infoValue}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className={styles.infoColumn}>
          {rightRows.map((row) => (
            <div key={row.label} className={styles.infoRow}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span className={styles.infoValue}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
