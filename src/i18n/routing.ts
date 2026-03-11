export const SUPPORTED_LOCALES = ["en", "ru"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  if (!value) {
    return false;
  }

  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function getLocaleFromPathname(pathname: string): SupportedLocale {
  const { locale } = stripLocalePrefix(pathname);
  return locale ?? DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): {
  locale: SupportedLocale | null;
  pathnameWithoutLocale: string;
} {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";

  if (!isSupportedLocale(first)) {
    return {
      locale: null,
      pathnameWithoutLocale: pathname,
    };
  }

  const remaining = segments.slice(1);
  const pathnameWithoutLocale = remaining.length > 0 ? `/${remaining.join("/")}` : "/";

  return {
    locale: first,
    pathnameWithoutLocale,
  };
}

export function withLocalePath(pathname: string, locale: SupportedLocale): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const { pathnameWithoutLocale } = stripLocalePrefix(normalized);

  if (pathnameWithoutLocale === "/") {
    return `/${locale}`;
  }

  return `/${locale}${pathnameWithoutLocale}`;
}

export function isPublicLocalizedPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/auctions" || pathname.startsWith("/auctions/");
}

export function toIntlLocale(locale: SupportedLocale): string {
  return locale === "ru" ? "ru-RU" : "en-GB";
}

export function detectLocaleFromAcceptLanguage(headerValue: string | null | undefined): SupportedLocale {
  if (!headerValue) {
    return DEFAULT_LOCALE;
  }

  const lowered = headerValue.toLowerCase();

  if (lowered.includes("ru")) {
    return "ru";
  }

  return DEFAULT_LOCALE;
}
