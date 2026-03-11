import type { SupportedLocale } from "@/src/i18n/routing";
import { formatInteger } from "@/src/lib/money";

import type { LotDetail } from "../page";
import styles from "./Sections.module.css";

type Props = { lot: LotDetail; locale: SupportedLocale };

export function VehicleInfo({ lot, locale }: Props) {
  const isRu = locale === "ru";

  const rows = [
    { label: "VIN", value: `${lot.vin.slice(0, 11)}****** (OK)` },
    { label: isRu ? "Пробег" : "Odometer", value: `${formatInteger(lot.mileageKm, locale)} ${isRu ? "км" : "km"}` },
    { label: isRu ? "Подушки" : "Airbags", value: lot.airbags },
    { label: isRu ? "Повреждения" : "Damage", value: lot.damage },
    { label: isRu ? "Состояние" : "Condition", value: lot.condition },
    { label: isRu ? "Спецификация" : "Region Spec", value: lot.regionSpec },
  ];

  return (
    <section className={styles.card} aria-labelledby="vi-heading">
      <h2 id="vi-heading" className={styles.cardTitle}>
        {isRu ? "Информация об автомобиле" : "Vehicle Information"}
      </h2>
      <dl className={styles.rowList}>
        {rows.map((row) => (
          <div key={row.label} className={styles.rowItem}>
            <dt className={styles.rowLabel}>{row.label}</dt>
            <dd className={styles.rowValue}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
