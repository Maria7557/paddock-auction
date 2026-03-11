import type { SupportedLocale } from "@/src/i18n/routing";
import { toIntlLocale } from "@/src/i18n/routing";

export const AED_USD_PEG_RATE = 1 / 3.6725;

export type DisplayCurrency = "AED" | "USD";

export type DisplaySettings = {
  locale: SupportedLocale;
  currency: DisplayCurrency;
  usdPerAed: number;
};

export function resolveDisplayCurrency(value: string | null | undefined): DisplayCurrency {
  return value?.toUpperCase() === "USD" ? "USD" : "AED";
}

export function formatMoneyFromAed(
  amountAed: number,
  options: {
    locale: SupportedLocale;
    currency: DisplayCurrency;
    usdPerAed?: number;
  },
): string {
  const intlLocale = toIntlLocale(options.locale);
  const rate = Number.isFinite(options.usdPerAed) ? options.usdPerAed ?? AED_USD_PEG_RATE : AED_USD_PEG_RATE;
  const amount = options.currency === "USD" ? amountAed * rate : amountAed;

  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: options.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatInteger(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value);
}
