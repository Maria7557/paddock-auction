export const runtime = "nodejs";

import { CompanyUserRole } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

const roleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "VIEWER"]),
});

function toCompanyRole(role: "OWNER" | "ADMIN" | "VIEWER"): CompanyUserRole {
  if (role === "OWNER") {
    return "OWNER";
  }

  if (role === "ADMIN") {
    return "MANAGER";
  }

  return "MEMBER";
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = roleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { userId } = await context.params;

  const updated = await prisma.companyUser.updateMany({
    where: {
      companyId: auth.companyId,
      userId,
    },
    data: {
      role: toCompanyRole(parsed.data.role),
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "MEMBER_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ message: "Role updated" });
}
