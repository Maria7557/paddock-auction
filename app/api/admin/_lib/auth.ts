import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyJwt } from "@/src/lib/auth";

export type AdminAuth = {
  userId: string;
  role: "ADMIN";
};

export type AdminAuthResult =
  | {
      auth: AdminAuth;
      error?: undefined;
    }
  | {
      auth?: undefined;
      error: NextResponse;
    };

function json(status: number, body: Record<string, unknown>): NextResponse {
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

export async function requireAdminAuth(request: NextRequest): Promise<AdminAuthResult> {
  const headerRole = request.headers.get("x-user-role")?.trim();
  const headerUserId = request.headers.get("x-user-id")?.trim();

  if (headerRole === "ADMIN" && headerUserId) {
    return {
      auth: {
        userId: headerUserId,
        role: "ADMIN",
      },
    };
  }

  const token = getTokenFromRequest(request);

  if (!token) {
    return {
      error: json(401, { error: "UNAUTHORIZED" }),
    };
  }

  const verified = await verifyJwt(token);

  if (!verified) {
    return {
      error: json(401, { error: "UNAUTHORIZED" }),
    };
  }

  if (verified.role !== "ADMIN") {
    return {
      error: json(403, { error: "FORBIDDEN" }),
    };
  }

  return {
    auth: {
      userId: verified.userId,
      role: "ADMIN",
    },
  };
}
