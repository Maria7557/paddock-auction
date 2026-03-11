"use client";

import type { DisplaySettings } from "@/src/lib/money";
import { formatInteger, formatMoneyFromAed } from "@/src/lib/money";

import styles from "./ActiveFilters.module.css";

const DEFAULT: Record<string, string> = {
  brand: "",
  model: "",
  status: "",
  minPrice: "",
  maxPrice: "",
  region: "",
  bodyType: "",
  fuelType: "",
  maxMileage: "",
  minYear: "",
  sort: "ending_soon",
};

function getLabels(isRu: boolean): Record<string, string> {
  return {
    brand: isRu ? "Бренд" : "Brand",
    model: isRu ? "Модель" : "Model",
    status: isRu ? "Статус" : "Status",
    minPrice: isRu ? "Мин. цена" : "Min price",
    maxPrice: isRu ? "Макс. цена" : "Max price",
    region: isRu ? "Регион" : "Region",
    bodyType: isRu ? "Кузов" : "Body",
    fuelType: isRu ? "Топливо" : "Fuel",
    maxMileage: isRu ? "Пробег до" : "Max km",
    minYear: isRu ? "Год от" : "From year",
  };
}

function formatValue(key: string, value: string, display: DisplaySettings): string {
  const isRu = display.locale === "ru";

  if (key === "status") {
    if (value === "LIVE") {
      return isRu ? "Сейчас в эфире" : "Live now";
    }

    return isRu ? "Скоро" : "Upcoming";
  }

  if (key === "minPrice") {
    return isRu
      ? `от ${formatMoneyFromAed(Number(value), display)}`
      : `from ${formatMoneyFromAed(Number(value), display)}`;
  }

  if (key === "maxPrice") {
    return isRu
      ? `до ${formatMoneyFromAed(Number(value), display)}`
      : `up to ${formatMoneyFromAed(Number(value), display)}`;
  }

  if (key === "maxMileage") {
    return isRu
      ? `до ${formatInteger(Number(value), display.locale)} км`
      : `under ${formatInteger(Number(value), display.locale)} km`;
  }

  if (key === "minYear") {
    return `${value}+`;
  }

  return value;
}

type Props = {
  filters: Record<string, string>;
  onClear: (key: string) => void;
  onClearAll: () => void;
  display: DisplaySettings;
};

export function ActiveFilters({ filters, onClear, onClearAll, display }: Props) {
  const isRu = display.locale === "ru";
  const labels = getLabels(isRu);

  const active = Object.entries(filters).filter(([key, value]) => {
    if (key === "sort") {
      return false;
    }

    return value !== "" && value !== DEFAULT[key];
  });

  if (active.length === 0) {
    return null;
  }

  return (
    <div className={styles.row}>
      {active.map(([key, value]) => (
        <span key={key} className={styles.chip}>
          <span className={styles.chipLabel}>{labels[key] ?? key}:</span>
          <span className={styles.chipValue}>{formatValue(key, value, display)}</span>
          <button type="button" className={styles.chipX} onClick={() => onClear(key)}>
            x
          </button>
        </span>
      ))}

      {active.length > 1 ? (
        <button type="button" className={styles.clearAll} onClick={onClearAll}>
          {isRu ? "Сбросить всё" : "Clear all"}
        </button>
      ) : null}
    </div>
  );
}
