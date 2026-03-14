"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  getLocaleFromPathname,
  isPublicLocalizedPath,
  stripLocalePrefix,
  type SupportedLocale,
  withLocalePath,
} from "@/src/i18n/routing";
import { resolveDisplayCurrency, type DisplayCurrency } from "@/src/lib/money";

import styles from "./MarketHeader.module.css";

type Props = {
  locale: SupportedLocale;
  currency: DisplayCurrency;
  labels: {
    language: string;
    currency: string;
    english: string;
    russian: string;
  };
};

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function LocaleCurrencyControls({ locale, currency, labels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedCurrency, setSelectedCurrency] = useState<DisplayCurrency>(currency);

  const currentLocale = useMemo(() => {
    const derived = stripLocalePrefix(pathname).locale;
    return derived ?? locale ?? getLocaleFromPathname(pathname);
  }, [locale, pathname]);

  const currentQuery = searchParams.toString();

  const updateLocale = (nextLocale: SupportedLocale) => {
    setCookie("fb_locale", nextLocale);

    const { pathnameWithoutLocale } = stripLocalePrefix(pathname);
    const hash = typeof window === "undefined" ? "" : window.location.hash;

    const targetPath = isPublicLocalizedPath(pathnameWithoutLocale)
      ? withLocalePath(pathnameWithoutLocale, nextLocale)
      : `/${nextLocale}`;

    const targetUrl = `${targetPath}${currentQuery ? `?${currentQuery}` : ""}${hash}`;
    router.push(targetUrl);
  };

  const updateCurrency = (nextCurrencyRaw: string) => {
    const nextCurrency = resolveDisplayCurrency(nextCurrencyRaw);
    setSelectedCurrency(nextCurrency);
    setCookie("fb_currency", nextCurrency);
    router.refresh();
  };

  return (
    <div className={styles.preferences}>
      <label className={styles.prefLabel}>
        <span className={styles.srOnly}>{labels.currency}</span>
        <select
          className={styles.prefSelect}
          value={selectedCurrency}
          onChange={(event) => updateCurrency(event.target.value)}
          aria-label={labels.currency}
        >
          <option value="AED">AED</option>
          <option value="USD">USD</option>
        </select>
      </label>

      <label className={styles.prefLabel}>
        <span className={styles.srOnly}>{labels.language}</span>
        <select
          className={styles.prefSelect}
          value={currentLocale}
          onChange={(event) => updateLocale(event.target.value as SupportedLocale)}
          aria-label={labels.language}
        >
          <option value="en">{labels.english}</option>
          <option value="ru">{labels.russian}</option>
        </select>
      </label>
    </div>
  );
}
