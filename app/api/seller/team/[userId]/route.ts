export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { userId } = await context.params;

  const deleted = await prisma.companyUser.deleteMany({
    where: {
      companyId: auth.companyId,
      userId,
    },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "MEMBER_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ message: "Access revoked" });
}
