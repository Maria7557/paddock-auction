"use client";

import styles from "./SortBar.module.css";

const SORT_OPTIONS = [
  { value: "ending_soon", label: "Ending Soon" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price Up" },
  { value: "price_desc", label: "Price Down" },
];

type Props = {
  sort: string;
  total: number;
  loading: boolean;
  onChange: (value: string) => void;
};

export function SortBar({ sort, total, loading, onChange }: Props) {
  return (
    <div className={styles.bar}>
      <span className={styles.count}>
        {loading ? "Loading..." : `${total} lot${total !== 1 ? "s" : ""} found`}
      </span>

      <div className={styles.options}>
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.opt} ${sort === option.value ? styles.optActive : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
