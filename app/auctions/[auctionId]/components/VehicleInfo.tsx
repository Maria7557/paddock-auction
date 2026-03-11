// app/lot/[id]/components/VehicleInfo.tsx
// Server component — pure display, no interactivity

import type { LotDetail } from '../page';
import styles from './Sections.module.css';

type Props = { lot: LotDetail };

export function VehicleInfo({ lot }: Props) {
  const rows = [
    { label: 'VIN',         value: `${lot.vin.slice(0, 11)}****** (OK)` },
    { label: 'Odometer',    value: `${lot.mileageKm.toLocaleString()} km` },
    { label: 'Airbags',     value: lot.airbags },
    { label: 'Damage',      value: lot.damage },
    { label: 'Condition',   value: lot.condition },
    { label: 'Region Spec', value: lot.regionSpec },
  ];

  return (
    <section className={styles.card} aria-labelledby="vi-heading">
      <h2 id="vi-heading" className={styles.cardTitle}>Vehicle Information</h2>
      <dl className={styles.rowList}>
        {rows.map((r) => (
          <div key={r.label} className={styles.rowItem}>
            <dt className={styles.rowLabel}>{r.label}</dt>
            <dd className={styles.rowValue}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
