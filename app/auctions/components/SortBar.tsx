"use client";

import type { SupportedLocale } from "@/src/i18n/routing";
import { formatInteger } from "@/src/lib/money";

import styles from "./SortBar.module.css";

const SORT_OPTIONS = {
  en: [
    { value: "ending_soon", label: "Ending Soon" },
    { value: "newest", label: "Newest" },
    { value: "price_asc", label: "Price Up" },
    { value: "price_desc", label: "Price Down" },
  ],
  ru: [
    { value: "ending_soon", label: "Скоро завершатся" },
    { value: "newest", label: "Новые" },
    { value: "price_asc", label: "Цена по возрастанию" },
    { value: "price_desc", label: "Цена по убыванию" },
  ],
} as const;

type Props = {
  sort: string;
  total: number;
  loading: boolean;
  onChange: (value: string) => void;
  locale: SupportedLocale;
};

export function SortBar({ sort, total, loading, onChange, locale }: Props) {
  const isRu = locale === "ru";
  const options = SORT_OPTIONS[locale];

  return (
    <div className={styles.bar}>
      <span className={styles.count}>
        {loading
          ? isRu
            ? "Загрузка..."
            : "Loading..."
          : isRu
            ? `Найдено: ${formatInteger(total, locale)} лотов`
            : `${formatInteger(total, locale)} lot${total !== 1 ? "s" : ""} found`}
      </span>

      <div className={styles.options}>
        {options.map((option) => (
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
