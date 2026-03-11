// app/lot/[id]/components/VehicleSpecs.tsx

import type { LotDetail } from '../page';
import styles from './Sections.module.css';

type Props = { lot: LotDetail };

export function VehicleSpecs({ lot }: Props) {
  const EMPTY_VALUES = new Set(['', '—', 'Not specified', 'N/A']);
  const isEmpty = (value: unknown) =>
    value == null || (typeof value === 'string' && EMPTY_VALUES.has(value.trim()));

  const exteriorColor = isEmpty(lot.color) ? null : lot.color;
  const interiorColor = isEmpty(lot.colorInterior) ? null : lot.colorInterior;
  const extIntColor =
    exteriorColor && interiorColor
      ? `${exteriorColor} / ${interiorColor}`
      : exteriorColor ?? interiorColor;

  const specs = [
    { label: 'Body Style', value: lot.bodyStyle },
    { label: 'Engine', value: lot.engine },
    { label: 'Transmission', value: lot.transmission },
    { label: 'Drive Line', value: lot.driveType },
    { label: 'Fuel Type', value: lot.fuelType },
    { label: 'Model', value: lot.model },
    { label: 'Series', value: lot.series },
    { label: 'Ext / Int Color', value: extIntColor },
  ].filter((spec) => !isEmpty(spec.value));

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
