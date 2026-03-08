import { NextRequest, NextResponse } from "next/server";

import { verifyJwt } from "@/src/lib/auth";

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

function redirectToLogin(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/login", request.url));
}

function unauthorizedForPath(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return unauthorizedResponse();
  }

  if (request.nextUrl.pathname.startsWith("/admin")) {
    return redirectToLogin(request);
  }

  return unauthorizedResponse();
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

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname === "/api/auctions" && request.method.toUpperCase() === "GET") {
    return NextResponse.next();
  }

  const token = getTokenFromRequest(request);

  if (!token) {
    return unauthorizedForPath(request);
  }

  const verified = await verifyJwt(token);

  if (!verified) {
    return unauthorizedForPath(request);
  }

  if (request.nextUrl.pathname.startsWith("/api/admin") && verified.role !== "ADMIN") {
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
  matcher: [
    "/dashboard/:path*",
    "/seller/:path*",
    "/wallet/:path*",
    "/my-bids/:path*",
    "/admin/:path*",
    "/api/auctions",
    "/api/bids/:path*",
    "/api/seller/:path*",
    "/api/buyer/:path*",
    "/api/wallet/:path*",
    "/api/admin/:path*",
  ],
};
