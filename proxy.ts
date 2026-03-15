import { NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_LOCALE,
  detectLocaleFromAcceptLanguage,
  isPublicLocalizedPath,
  isSupportedLocale,
  stripLocalePrefix,
  withLocalePath,
} from "@/src/i18n/routing";

const LOCALE_COOKIE = "fb_locale";
const CURRENCY_COOKIE = "fb_currency";

function detectLocale(request: NextRequest) {
  const localeFromCookie = request.cookies.get(LOCALE_COOKIE)?.value;

  if (isSupportedLocale(localeFromCookie)) {
    return localeFromCookie;
  }

  return detectLocaleFromAcceptLanguage(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

function withPreferenceCookies(
  request: NextRequest,
  response: NextResponse,
  locale: "en" | "ru",
) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  if (!request.cookies.get(CURRENCY_COOKIE)?.value) {
    response.cookies.set(CURRENCY_COOKIE, "AED", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return response;
}

function applyPublicLocaleRouting(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api")) {
    return null;
  }

  const { locale, pathnameWithoutLocale } = stripLocalePrefix(pathname);

  if (locale && isPublicLocalizedPath(pathnameWithoutLocale)) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathnameWithoutLocale;

    return withPreferenceCookies(request, NextResponse.rewrite(rewriteUrl), locale);
  }

  if (!locale && isPublicLocalizedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    const resolvedLocale = detectLocale(request);
    redirectUrl.pathname = withLocalePath(pathname, resolvedLocale);

    return withPreferenceCookies(request, NextResponse.redirect(redirectUrl), resolvedLocale);
  }

  return null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const localeRoutingResponse = applyPublicLocaleRouting(request);

  if (localeRoutingResponse) {
    return localeRoutingResponse;
  }

  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
