"use client";

import styles from "./ActiveFilters.module.css";

const LABELS: Record<string, string> = {
  brand: "Brand",
  model: "Model",
  status: "Status",
  minPrice: "Min price",
  maxPrice: "Max price",
  region: "Region",
  bodyType: "Body",
  fuelType: "Fuel",
  maxMileage: "Max km",
  minYear: "From year",
};

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

function formatValue(key: string, value: string): string {
  if (key === "status") {
    return value === "LIVE" ? "Live now" : "Upcoming";
  }

  if (key === "minPrice") {
    return `from AED ${Number(value).toLocaleString()}`;
  }

  if (key === "maxPrice") {
    return `up to AED ${Number(value).toLocaleString()}`;
  }

  if (key === "maxMileage") {
    return `under ${Number(value).toLocaleString()} km`;
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
};

export function ActiveFilters({ filters, onClear, onClearAll }: Props) {
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
          <span className={styles.chipLabel}>{LABELS[key] ?? key}:</span>
          <span className={styles.chipValue}>{formatValue(key, value)}</span>
          <button type="button" className={styles.chipX} onClick={() => onClear(key)}>
            x
          </button>
        </span>
      ))}

      {active.length > 1 ? (
        <button type="button" className={styles.clearAll} onClick={onClearAll}>
          Clear all
        </button>
      ) : null}
    </div>
  );
}
