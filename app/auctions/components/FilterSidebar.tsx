"use client";

import type { DisplaySettings } from "@/src/lib/money";
import { formatInteger } from "@/src/lib/money";

import styles from "./FilterSidebar.module.css";

const REGIONS = ["GCC", "USDM", "JDM", "European"];
const BODY_TYPES = ["SUV", "Sedan", "Pickup", "Van", "Hatchback", "Coupe", "Convertible"];
const FUEL_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid"];
const PRICE_OPTIONS = ["", "25000", "50000", "75000", "100000", "150000", "200000", "300000", "500000"];
const MILEAGE_OPTIONS = ["", "30000", "60000", "100000", "150000"];
const YEAR_OPTIONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

type Props = {
  filters: Record<string, string>;
  brands: string[];
  models: string[];
  onChange: (key: string, value: string) => void;
  onClearAll: () => void;
  activeCount: number;
  display: DisplaySettings;
};

function formatPriceOption(value: string, locale: DisplaySettings["locale"]): string {
  if (!value) {
    return "";
  }

  return formatInteger(Number(value), locale);
}

export function FilterSidebar({ filters, brands, models, onChange, onClearAll, activeCount, display }: Props) {
  const isRu = display.locale === "ru";

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>{isRu ? "Фильтры" : "Filters"}</span>
        {activeCount > 0 ? (
          <button type="button" className={styles.clearAllBtn} onClick={onClearAll}>
            {isRu ? `Сбросить (${activeCount})` : `Clear all (${activeCount})`}
          </button>
        ) : null}
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="auctions-filter-brand">
          {isRu ? "Бренд" : "Brand"}
        </label>
        <select
          id="auctions-filter-brand"
          className={styles.select}
          value={filters.brand}
          onChange={(event) => onChange("brand", event.target.value)}
        >
          <option value="">{isRu ? "Все бренды" : "All brands"}</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="auctions-filter-model">
          {isRu ? "Модель" : "Model"}
        </label>
        <select
          id="auctions-filter-model"
          className={styles.select}
          value={filters.model}
          onChange={(event) => onChange("model", event.target.value)}
          disabled={!filters.brand}
        >
          <option value="">{filters.brand ? (isRu ? "Все модели" : "All models") : isRu ? "Сначала выберите бренд" : "Select brand first"}</option>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>{isRu ? "Статус" : "Status"}</label>
        <div className={styles.pills}>
          {[
            { value: "", label: isRu ? "Все" : "All" },
            { value: "LIVE", label: isRu ? "В эфире" : "Live now" },
            { value: "SCHEDULED", label: isRu ? "Скоро" : "Upcoming" },
          ].map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              className={`${styles.pill} ${filters.status === option.value ? styles.pillActive : ""}`}
              onClick={() => onChange("status", option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>{isRu ? `Цена (${display.currency})` : `Price (${display.currency})`}</label>
        <div className={styles.rangeRow}>
          <select className={styles.select} value={filters.minPrice} onChange={(event) => onChange("minPrice", event.target.value)}>
            {PRICE_OPTIONS.map((value) => (
              <option key={`min-${value || "any"}`} value={value}>
                {value
                  ? isRu
                    ? `Мин ${formatPriceOption(value, display.locale)}`
                    : `Min ${formatPriceOption(value, display.locale)}`
                  : isRu
                    ? "Мин любой"
                    : "Min any"}
              </option>
            ))}
          </select>
          <span className={styles.rangeSep}>-</span>
          <select className={styles.select} value={filters.maxPrice} onChange={(event) => onChange("maxPrice", event.target.value)}>
            {PRICE_OPTIONS.map((value) => (
              <option key={`max-${value || "any"}`} value={value}>
                {value
                  ? isRu
                    ? `Макс ${formatPriceOption(value, display.locale)}`
                    : `Max ${formatPriceOption(value, display.locale)}`
                  : isRu
                    ? "Макс любой"
                    : "Max any"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>{isRu ? "Региональная спецификация" : "Region Spec"}</label>
        <div className={styles.pills}>
          <button
            type="button"
            className={`${styles.pill} ${filters.region === "" ? styles.pillActive : ""}`}
            onClick={() => onChange("region", "")}
          >
            {isRu ? "Любая" : "Any"}
          </button>
          {REGIONS.map((region) => (
            <button
              key={region}
              type="button"
              className={`${styles.pill} ${filters.region === region ? styles.pillActive : ""}`}
              onClick={() => onChange("region", region)}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>{isRu ? "Тип кузова" : "Body Type"}</label>
        <div className={styles.pills}>
          <button
            type="button"
            className={`${styles.pill} ${filters.bodyType === "" ? styles.pillActive : ""}`}
            onClick={() => onChange("bodyType", "")}
          >
            {isRu ? "Любой" : "Any"}
          </button>
          {BODY_TYPES.map((bodyType) => (
            <button
              key={bodyType}
              type="button"
              className={`${styles.pill} ${filters.bodyType === bodyType ? styles.pillActive : ""}`}
              onClick={() => onChange("bodyType", bodyType)}
            >
              {bodyType}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>{isRu ? "Тип топлива" : "Fuel Type"}</label>
        <div className={styles.pills}>
          <button
            type="button"
            className={`${styles.pill} ${filters.fuelType === "" ? styles.pillActive : ""}`}
            onClick={() => onChange("fuelType", "")}
          >
            {isRu ? "Любой" : "Any"}
          </button>
          {FUEL_TYPES.map((fuelType) => (
            <button
              key={fuelType}
              type="button"
              className={`${styles.pill} ${filters.fuelType === fuelType ? styles.pillActive : ""}`}
              onClick={() => onChange("fuelType", fuelType)}
            >
              {fuelType}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="auctions-filter-mileage">
          {isRu ? "Пробег до" : "Max Mileage"}
        </label>
        <select
          id="auctions-filter-mileage"
          className={styles.select}
          value={filters.maxMileage}
          onChange={(event) => onChange("maxMileage", event.target.value)}
        >
          {MILEAGE_OPTIONS.map((value) => (
            <option key={value || "any"} value={value}>
              {!value
                ? isRu
                  ? "Любой пробег"
                  : "Any mileage"
                : isRu
                  ? `До ${formatInteger(Number(value), display.locale)} км`
                  : `Under ${formatInteger(Number(value), display.locale)} km`}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="auctions-filter-year">
          {isRu ? "Год (от)" : "Year (from)"}
        </label>
        <select
          id="auctions-filter-year"
          className={styles.select}
          value={filters.minYear}
          onChange={(event) => onChange("minYear", event.target.value)}
        >
          <option value="">{isRu ? "Любой год" : "Any year"}</option>
          {YEAR_OPTIONS.map((year) => (
            <option key={year} value={String(year)}>
              {year}+
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
