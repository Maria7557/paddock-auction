import { NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_LOCALE,
  detectLocaleFromAcceptLanguage,
  isPublicLocalizedPath,
  isSupportedLocale,
  stripLocalePrefix,
  withLocalePath,
} from "@/src/i18n/routing";
import { verifyJwt } from "@/src/lib/auth";

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

function getTokenFromRequest(request: NextRequest): string | null {
  const authorizationHeader = request.headers.get("authorization")?.trim() ?? "";

  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    const token = authorizationHeader.slice(7).trim();

    if (token.length > 0) {
      return token;
    }
  }

  const cookieToken = request.cookies.get("token")?.value?.trim();

  if (cookieToken && cookieToken.length > 0) {
    return cookieToken;
  }

  return null;
}

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "UNAUTHORIZED",
    },
    {
      status: 401,
    },
  );
}

function forbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "FORBIDDEN",
    },
    {
      status: 403,
    },
  );
}

function isProtectedApiPath(pathname: string, method: string): boolean {
  if (pathname === "/api/auctions") {
    return method !== "GET";
  }

  return ["/api/bids", "/api/seller", "/api/buyer", "/api/wallet", "/api/admin"].some((prefix) =>
    pathname.startsWith(prefix),
  );
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

  if (!isProtectedApiPath(pathname, request.method.toUpperCase())) {
    return NextResponse.next();
  }

  const token = getTokenFromRequest(request);

  if (!token) {
    return unauthorizedResponse();
  }

  const verified = await verifyJwt(token);

  if (!verified) {
    return unauthorizedResponse();
  }

  if (pathname.startsWith("/api/admin") && verified.role !== "ADMIN") {
    return forbiddenResponse();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", verified.userId);
  requestHeaders.set("x-user-role", verified.role);
  requestHeaders.set("x-kyc-verified", verified.kycVerified ? "true" : "false");

  if (verified.companyId) {
    requestHeaders.set("x-company-id", verified.companyId);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
