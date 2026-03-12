import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/app/api/admin/_lib/auth";

export type AdminSession = {
  actorId: string;
};

export async function requireAdminSession(
  request: NextRequest,
): Promise<AdminSession | NextResponse> {
  const result = await requireAdminAuth(request);

  if (result.error) {
    return result.error;
  }

  if (result.auth) {
    return { actorId: result.auth.userId };
  }

  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}
