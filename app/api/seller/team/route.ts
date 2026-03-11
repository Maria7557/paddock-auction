export const runtime = "nodejs";

import { CompanyUserRole } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

function toUiRole(role: CompanyUserRole): "OWNER" | "ADMIN" | "VIEWER" {
  if (role === "OWNER") {
    return "OWNER";
  }

  if (role === "SELLER_MANAGER" || role === "MANAGER") {
    return "ADMIN";
  }

  return "VIEWER";
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const members = await prisma.companyUser.findMany({
    where: {
      companyId: auth.companyId,
    },
    orderBy: [{ role: "asc" }, { id: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          email: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json({
    members: members.map((member) => ({
      userId: member.user.id,
      name: displayNameFromEmail(member.user.email),
      email: member.user.email,
      role: toUiRole(member.role),
      status: member.user.status,
    })),
  });
}
