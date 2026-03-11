import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type SellerApiAuth = {
  userId: string;
  companyId: string;
};

export function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

export function requireSellerApiAuth(request: NextRequest): SellerApiAuth | NextResponse {
  const role = request.headers.get("x-user-role")?.trim();

  if (role !== "SELLER") {
    return json(403, { error: "SELLERS_ONLY" });
  }

  const userId = request.headers.get("x-user-id")?.trim();
  const companyId = request.headers.get("x-company-id")?.trim();

  if (!userId || !companyId) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  return { userId, companyId };
}
