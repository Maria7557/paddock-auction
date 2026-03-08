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
  const token = getTokenFromRequest(request);

  if (!token) {
    return unauthorizedResponse();
  }

  const verified = await verifyJwt(token);

  if (!verified) {
    return unauthorizedResponse();
  }

  if (request.nextUrl.pathname.startsWith("/api/admin") && verified.role !== "ADMIN") {
    return forbiddenResponse();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", verified.userId);
  requestHeaders.set("x-user-role", verified.role);

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
    "/wallet/:path*",
    "/my-bids/:path*",
    "/admin/:path*",
    "/api/bids/:path*",
    "/api/wallet/:path*",
    "/api/admin/:path*",
  ],
};
