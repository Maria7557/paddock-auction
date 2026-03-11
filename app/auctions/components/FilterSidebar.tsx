"use client";

import styles from "./FilterSidebar.module.css";

const REGIONS = ["GCC", "USDM", "JDM", "European"];
const BODY_TYPES = ["SUV", "Sedan", "Pickup", "Van", "Hatchback", "Coupe", "Convertible"];
const FUEL_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid"];
const PRICE_OPTIONS = [
  { label: "Any", value: "" },
  { label: "25 000", value: "25000" },
  { label: "50 000", value: "50000" },
  { label: "75 000", value: "75000" },
  { label: "100 000", value: "100000" },
  { label: "150 000", value: "150000" },
  { label: "200 000", value: "200000" },
  { label: "300 000", value: "300000" },
  { label: "500 000", value: "500000" },
];
const MILEAGE_OPTIONS = [
  { label: "Any mileage", value: "" },
  { label: "Under 30,000 km", value: "30000" },
  { label: "Under 60,000 km", value: "60000" },
  { label: "Under 100,000 km", value: "100000" },
  { label: "Under 150,000 km", value: "150000" },
];
const YEAR_OPTIONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

type Props = {
  filters: Record<string, string>;
  brands: string[];
  models: string[];
  onChange: (key: string, value: string) => void;
  onClearAll: () => void;
  activeCount: number;
};

export function FilterSidebar({
  filters,
  brands,
  models,
  onChange,
  onClearAll,
  activeCount,
}: Props) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Filters</span>
        {activeCount > 0 ? (
          <button type="button" className={styles.clearAllBtn} onClick={onClearAll}>
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="auctions-filter-brand">
          Brand
        </label>
        <select
          id="auctions-filter-brand"
          className={styles.select}
          value={filters.brand}
          onChange={(event) => onChange("brand", event.target.value)}
        >
          <option value="">All brands</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="auctions-filter-model">
          Model
        </label>
        <select
          id="auctions-filter-model"
          className={styles.select}
          value={filters.model}
          onChange={(event) => onChange("model", event.target.value)}
          disabled={!filters.brand}
        >
          <option value="">{filters.brand ? "All models" : "Select brand first"}</option>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Status</label>
        <div className={styles.pills}>
          {[
            { value: "", label: "All" },
            { value: "LIVE", label: "Live now" },
            { value: "SCHEDULED", label: "Upcoming" },
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
        <label className={styles.label}>Price (AED)</label>
        <div className={styles.rangeRow}>
          <select
            className={styles.select}
            value={filters.minPrice}
            onChange={(event) => onChange("minPrice", event.target.value)}
          >
            {PRICE_OPTIONS.map((option) => (
              <option key={`min-${option.value || "any"}`} value={option.value}>
                {option.value ? `Min ${option.label}` : "Min any"}
              </option>
            ))}
          </select>
          <span className={styles.rangeSep}>-</span>
          <select
            className={styles.select}
            value={filters.maxPrice}
            onChange={(event) => onChange("maxPrice", event.target.value)}
          >
            {PRICE_OPTIONS.map((option) => (
              <option key={`max-${option.value || "any"}`} value={option.value}>
                {option.value ? `Max ${option.label}` : "Max any"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Region Spec</label>
        <div className={styles.pills}>
          <button
            type="button"
            className={`${styles.pill} ${filters.region === "" ? styles.pillActive : ""}`}
            onClick={() => onChange("region", "")}
          >
            Any
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
        <label className={styles.label}>Body Type</label>
        <div className={styles.pills}>
          <button
            type="button"
            className={`${styles.pill} ${filters.bodyType === "" ? styles.pillActive : ""}`}
            onClick={() => onChange("bodyType", "")}
          >
            Any
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
        <label className={styles.label}>Fuel Type</label>
        <div className={styles.pills}>
          <button
            type="button"
            className={`${styles.pill} ${filters.fuelType === "" ? styles.pillActive : ""}`}
            onClick={() => onChange("fuelType", "")}
          >
            Any
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
          Max Mileage
        </label>
        <select
          id="auctions-filter-mileage"
          className={styles.select}
          value={filters.maxMileage}
          onChange={(event) => onChange("maxMileage", event.target.value)}
        >
          {MILEAGE_OPTIONS.map((option) => (
            <option key={option.value || "any"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="auctions-filter-year">
          Year (from)
        </label>
        <select
          id="auctions-filter-year"
          className={styles.select}
          value={filters.minYear}
          onChange={(event) => onChange("minYear", event.target.value)}
        >
          <option value="">Any year</option>
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
