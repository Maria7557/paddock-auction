"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { DamageDiagram } from "@/components/seller/DamageDiagram";
import type { SupportedLocale } from "@/src/i18n/routing";
import { formatInteger } from "@/src/lib/money";

import type { LotDetail } from "../types";
import styles from "./Sections.module.css";

type Props = {
  lot: LotDetail;
  locale: SupportedLocale;
};

type RowTone = "positive" | "warning" | "muted";

type InfoRow = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: RowTone;
};

function maskVin(vin: string): string {
  const cleanVin = vin.replace(/\s+/g, "");
  return cleanVin.length <= 8 ? `•••${cleanVin}` : `•••${cleanVin.slice(-8)}`;
}

function getGradeLabel(grade: LotDetail["conditionGrade"], locale: SupportedLocale): string {
  const isRu = locale === "ru";
  const normalized = grade.trim().toUpperCase();

  if (normalized.startsWith("A")) {
    return isRu ? "Отличное" : "Excellent";
  }

  if (normalized.startsWith("B")) {
    return isRu ? "Хорошее" : "Good";
  }

  if (normalized.startsWith("C")) {
    return isRu ? "Требует внимания" : "Needs attention";
  }

  return isRu ? "На проверке" : "Review";
}

export function VehicleInfo({ lot, locale }: Props) {
  const isRu = locale === "ru";
  const [isDamageOpen, setIsDamageOpen] = useState(false);
  const normalizedConditionGrade = lot.conditionGrade.trim().toUpperCase();
  const damageLevelLabels = useMemo(
    () =>
      ({
        MINOR: isRu ? "Незначительное" : "Minor",
        MAJOR: isRu ? "Серьёзное" : "Major",
      }) as const,
    [isRu],
  );
  const leftRows: InfoRow[] = [
    {
      label: isRu ? "Сток / лот" : "Stock / lot",
      value: lot.lotNumber,
      mono: true,
    },
    {
      label: "VIN (status)",
      value: `${maskVin(lot.vin)} (OK)`,
      mono: true,
    },
    {
      label: isRu ? "Основное повреждение" : "Primary damage",
      value: lot.primaryDamage,
    },
    {
      label: isRu ? "Статус тайтла" : "Title status",
      value: lot.titleStatus,
    },
    {
      label: isRu ? "Код запуска" : "Start code",
      value: lot.startCode,
      tone: lot.startCode === "Run & Drive" ? "positive" : "muted",
    },
    {
      label: isRu ? "Ключи" : "Keys",
      value: `${lot.numberOfKeys} ${isRu ? "в наличии" : "present"}`,
    },
    {
      label: isRu ? "Одометр" : "Odometer",
      value: `${formatInteger(lot.mileageKm, locale)} ${isRu ? "км" : "km"} (Actual)`,
    },
    {
      label: isRu ? "Подушки безопасности" : "Airbags",
      value: lot.airbagCount ? `${lot.airbags} · ${lot.airbagCount}` : lot.airbags,
    },
  ];
  const rightRows: InfoRow[] = [
    {
      label: isRu ? "Оценка состояния" : "Condition grade",
      value: (
        <span className={styles.gradeWrap}>
          <span
            className={`${styles.gradePill} ${
              normalizedConditionGrade.startsWith("A")
                ? styles.gradeA
                : normalizedConditionGrade.startsWith("B")
                  ? styles.gradeB
                  : normalizedConditionGrade.startsWith("C")
                    ? styles.gradeC
                    : styles.gradeD
            }`}
          >
            {lot.conditionGrade}
          </span>
          <span>{getGradeLabel(lot.conditionGrade, locale)}</span>
        </span>
      ),
    },
    {
      label: isRu ? "Гарантия" : "Warranty",
      value:
        lot.warrantyStatus === "ACTIVE"
          ? isRu
            ? "Активна"
            : "Active"
          : lot.warrantyStatus === "EXPIRED"
            ? isRu
              ? "Истекла"
              : "Expired"
            : isRu
              ? "Нет"
              : "None",
      tone:
        lot.warrantyStatus === "ACTIVE"
          ? "positive"
          : lot.warrantyStatus === "EXPIRED"
            ? "warning"
            : "muted",
    },
    {
      label: isRu ? "История сервиса" : "Service history",
      value: lot.serviceHistory ? (isRu ? "Полные записи" : "Full records") : isRu ? "Нет данных" : "Not available",
      tone: lot.serviceHistory ? "positive" : "muted",
    },
    {
      label: isRu ? "Региональная спецификация" : "Region spec",
      value: lot.regionSpec,
    },
    {
      label: isRu ? "Произведён" : "Made in",
      value: lot.manufacturedIn,
    },
    {
      label: isRu ? "Состояние шин" : "Tyre condition",
      value: lot.tireCondition == null ? "—" : `${lot.tireCondition}%`,
    },
    {
      label: isRu ? "Цвет кузова" : "Exterior color",
      value: lot.color,
    },
    {
      label: isRu ? "Интерьер" : "Interior",
      value: `${lot.colorInterior} · ${lot.interiorMaterial}`,
    },
  ];

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

  return (
    <section className={styles.section} aria-labelledby="vehicle-info-title">
      <div className={styles.sectionHeader}>
        <h2 id="vehicle-info-title" className={styles.sectionTitle}>
          {isRu ? "Информация об автомобиле" : "Vehicle information"}
        </h2>
      </div>

      <div className={styles.infoGrid}>
        <div className={styles.infoColumn}>
          {leftRows.map((row) => (
            <div key={row.label} className={styles.infoRow}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span
                className={`${styles.infoValue} ${row.mono ? styles.infoValueMono : ""} ${
                  row.tone === "positive"
                    ? styles.valuePositive
                    : row.tone === "warning"
                      ? styles.valueWarning
                      : row.tone === "muted"
                        ? styles.valueMuted
                        : ""
                }`.trim()}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.infoColumn}>
          {rightRows.map((row) => (
            <div key={row.label} className={styles.infoRow}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span
                className={`${styles.infoValue} ${
                  row.tone === "positive"
                    ? styles.valuePositive
                    : row.tone === "warning"
                      ? styles.valueWarning
                      : row.tone === "muted"
                        ? styles.valueMuted
                        : ""
                }`.trim()}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.damageFooter}>
        <span className={styles.damageLabel}>{isRu ? "Схема повреждений" : "Damage diagram"}</span>
        {lot.damageItems.length > 0 ? (
          <span className={styles.damageValue}>
            <span>{isRu ? "Есть отмеченные зоны" : "Marked zones available"}</span>
            <button type="button" className={styles.inlineLink} onClick={() => setIsDamageOpen(true)}>
              {isRu ? "Открыть" : "Open"}
            </button>
          </span>
        ) : (
          <span className={styles.damageValue}>{isRu ? "Повреждения: нет" : "Damage: None"}</span>
        )}
      </div>

      {isDamageOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setIsDamageOpen(false)}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="damage-diagram-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 id="damage-diagram-title" className={styles.modalTitle}>
                  {isRu ? "Схема повреждений" : "Damage diagram"}
                </h3>
                <p className={styles.modalSubtitle}>
                  {isRu
                    ? "Зоны повреждений, отмеченные продавцом при подаче автомобиля."
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
