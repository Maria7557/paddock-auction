// app/lot/[id]/components/VehicleSpecs.tsx

import type { LotDetail } from '../page';
import styles from './Sections.module.css';

type Props = { lot: LotDetail };

export function VehicleSpecs({ lot }: Props) {
  const specs = [
    { label: 'Body Style',    value: lot.bodyStyle },
    { label: 'Engine',        value: lot.engine },
    { label: 'Transmission',  value: lot.transmission },
    { label: 'Drive Line',    value: lot.driveType },
    { label: 'Fuel Type',     value: lot.fuelType },
    { label: 'Model',         value: lot.model },
    { label: 'Series',        value: lot.series || '—' },
    { label: 'Ext / Int Color', value: lot.color && lot.colorInterior && lot.colorInterior !== '—'
        ? `${lot.color} / ${lot.colorInterior}`
        : lot.color || '—' },
  ].filter((spec) => spec.value && spec.value !== '—');

  return (
    <section className={styles.card} aria-labelledby="vs-heading">
      <h2 id="vs-heading" className={styles.cardTitle}>Vehicle Specifications</h2>
      <div className={styles.specsGrid}>
        {specs.map((s) => (
          <div key={s.label} className={styles.specCell}>
            <div className={styles.specLabel}>{s.label}</div>
            <div className={styles.specValue}>{s.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
