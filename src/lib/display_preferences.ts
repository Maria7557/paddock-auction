import { cookies, headers } from "next/headers";

import {
  DEFAULT_LOCALE,
  detectLocaleFromAcceptLanguage,
  isSupportedLocale,
  type SupportedLocale,
} from "@/src/i18n/routing";
import { getUsdPerAedRate } from "@/src/lib/fx";
import {
  AED_USD_PEG_RATE,
  resolveDisplayCurrency,
  type DisplayCurrency,
  type DisplaySettings,
} from "@/src/lib/money";

const LOCALE_COOKIE = "fb_locale";
const CURRENCY_COOKIE = "fb_currency";

export async function getLocalePreference(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE)?.value;

  if (isSupportedLocale(localeCookie)) {
    return localeCookie;
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language");
  return detectLocaleFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

export async function getCurrencyPreference(): Promise<DisplayCurrency> {
  const cookieStore = await cookies();
  return resolveDisplayCurrency(cookieStore.get(CURRENCY_COOKIE)?.value);
}

export async function getPublicDisplaySettings(): Promise<DisplaySettings> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;
  const currency = resolveDisplayCurrency(cookieStore.get(CURRENCY_COOKIE)?.value);

  if (currency === "AED") {
    return {
      locale,
      currency,
      usdPerAed: AED_USD_PEG_RATE,
    };
  }

  return {
    locale,
    currency,
    usdPerAed: await getUsdPerAedRate(),
  };
}
