import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyJwt } from "@/src/lib/auth";

export type SellerApiAuth = {
  userId: string;
  companyId: string;
};

export function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

function readCookieToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const [rawKey, ...rawValueParts] = segment.trim().split("=");

    if (rawKey !== "token") {
      continue;
    }

    const value = rawValueParts.join("=").trim();

    if (value.length > 0) {
      return value;
    }
  }

  return null;
}

function getTokenFromRequest(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();

    if (token.length > 0) {
      return token;
    }
  }

  const cookieToken = request.cookies.get("token")?.value?.trim();

  if (cookieToken && cookieToken.length > 0) {
    return cookieToken;
  }

  return readCookieToken(request.headers.get("cookie"));
}

export async function requireSellerApiAuth(request: NextRequest): Promise<SellerApiAuth | NextResponse> {
  const role = request.headers.get("x-user-role")?.trim();
  const userId = request.headers.get("x-user-id")?.trim();
  const companyId = request.headers.get("x-company-id")?.trim();

  if (role === "SELLER" && userId && companyId) {
    return { userId, companyId };
  }

  const token = getTokenFromRequest(request);

  if (!token) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  const verified = await verifyJwt(token);

  if (!verified) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  if (verified.role !== "SELLER") {
    return json(403, { error: "SELLERS_ONLY" });
  }

  if (!verified.userId || !verified.companyId) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  return {
    userId: verified.userId,
    companyId: verified.companyId,
  };
}
