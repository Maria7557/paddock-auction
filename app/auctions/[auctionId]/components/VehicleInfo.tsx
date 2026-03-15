"use client";

import { useEffect, useState, type ReactNode } from "react";

import { DamageDiagram } from "@/components/seller/DamageDiagram";
import type { SupportedLocale } from "@/src/i18n/routing";
import { formatInteger } from "@/src/lib/money";

import type { LotDetail } from "../page";
import styles from "./Sections.module.css";

type Props = { lot: LotDetail; locale: SupportedLocale };

export function VehicleInfo({ lot, locale }: Props) {
  const [isDamageOpen, setIsDamageOpen] = useState(false);
  const isRu = locale === "ru";
  const damageLevelLabels = {
    MINOR: isRu ? "Незначительное" : "Minor",
    MAJOR: isRu ? "Серьезное" : "Major",
  } as const;

  useEffect(() => {
    if (!isDamageOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDamageOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDamageOpen]);

  const rows = [
    { label: "VIN", value: `${lot.vin.slice(0, 11)}****** (OK)` },
    { label: isRu ? "Пробег" : "Odometer", value: `${formatInteger(lot.mileageKm, locale)} ${isRu ? "км" : "km"}` },
    { label: isRu ? "Подушки" : "Airbags", value: lot.airbags },
    {
      label: isRu ? "Повреждения" : "Damage",
      value:
        lot.damageItems.length > 0 ? (
          <span className={styles.damageSummary}>
            <span>{isRu ? "Подробнее" : "Details"}</span>
            <button
              type="button"
              className={styles.detailTrigger}
              onClick={() => setIsDamageOpen(true)}
            >
              {isRu ? "Открыть схему" : "Open diagram"}
            </button>
          </span>
        ) : (
          lot.damage
        ),
      rowClassName: lot.damageItems.length > 0 ? styles.rowItemMulti : undefined,
    },
    { label: isRu ? "Состояние" : "Condition", value: lot.condition },
    { label: isRu ? "Спецификация" : "Region Spec", value: lot.regionSpec },
  ] satisfies Array<{ label: string; value: ReactNode; rowClassName?: string }>;

  return (
    <section className={styles.card} aria-labelledby="vi-heading">
      <h2 id="vi-heading" className={styles.cardTitle}>
        {isRu ? "Информация об автомобиле" : "Vehicle Information"}
      </h2>
      <dl className={styles.rowList}>
        {rows.map((row) => (
          <div key={row.label} className={`${styles.rowItem} ${row.rowClassName ?? ""}`.trim()}>
            <dt className={styles.rowLabel}>{row.label}</dt>
            <dd className={styles.rowValue}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {isDamageOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setIsDamageOpen(false)}
        >
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="damage-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 id="damage-dialog-title" className={styles.modalTitle}>
                  {isRu ? "Схема повреждений" : "Damage diagram"}
                </h3>
                <p className={styles.modalSubtitle}>
                  {isRu
                    ? "Зоны повреждений, которые продавец отметил при добавлении автомобиля."
                    : "Damage zones marked by the seller during vehicle submission."}
                </p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setIsDamageOpen(false)}
                aria-label={isRu ? "Закрыть" : "Close"}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <DamageDiagram value={lot.damageMap} readOnly locale={locale} />

              <div className={styles.modalList}>
                {lot.damageItems.map((item) => (
                  <div key={`${item.label}-${item.level}`} className={styles.modalListItem}>
                    <span>{item.label}</span>
                    <span className={styles.damageLevel}>{damageLevelLabels[item.level]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
