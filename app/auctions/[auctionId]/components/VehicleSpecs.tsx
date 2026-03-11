import type { SupportedLocale } from "@/src/i18n/routing";

import type { LotDetail } from "../page";
import styles from "./Sections.module.css";

type Props = { lot: LotDetail; locale: SupportedLocale };

export function VehicleSpecs({ lot, locale }: Props) {
  const isRu = locale === "ru";
  const EMPTY_VALUES = new Set(["", "—", "Not specified", "N/A"]);
  const isEmpty = (value: unknown) => value == null || (typeof value === "string" && EMPTY_VALUES.has(value.trim()));

  const exteriorColor = isEmpty(lot.color) ? null : lot.color;
  const interiorColor = isEmpty(lot.colorInterior) ? null : lot.colorInterior;
  const extIntColor = exteriorColor && interiorColor ? `${exteriorColor} / ${interiorColor}` : exteriorColor ?? interiorColor;

  const specs = [
    { label: isRu ? "Кузов" : "Body Style", value: lot.bodyStyle },
    { label: isRu ? "Двигатель" : "Engine", value: lot.engine },
    { label: isRu ? "Трансмиссия" : "Transmission", value: lot.transmission },
    { label: isRu ? "Привод" : "Drive Line", value: lot.driveType },
    { label: isRu ? "Топливо" : "Fuel Type", value: lot.fuelType },
    { label: isRu ? "Модель" : "Model", value: lot.model },
    { label: isRu ? "Серия" : "Series", value: lot.series },
    { label: isRu ? "Цвет экст./инт." : "Ext / Int Color", value: extIntColor },
  ].filter((spec) => !isEmpty(spec.value));

  return (
    <section className={styles.card} aria-labelledby="vs-heading">
      <h2 id="vs-heading" className={styles.cardTitle}>
        {isRu ? "Технические характеристики" : "Vehicle Specifications"}
      </h2>
      <div className={styles.specsGrid}>
        {specs.map((spec) => (
          <div key={spec.label} className={styles.specCell}>
            <div className={styles.specLabel}>{spec.label}</div>
            <div className={styles.specValue}>{spec.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
