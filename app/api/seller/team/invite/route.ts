export const runtime = "nodejs";

import { CompanyUserRole, UserRole, UserStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

const inviteSchema = z.object({
  email: z.string().trim().email(),
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const normalizedEmail = payload.email.toLowerCase();

  const member = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          email: normalizedEmail,
          role: UserRole.SELLER,
          status: UserStatus.PENDING_APPROVAL,
          kycVerified: false,
        },
        select: {
          id: true,
        },
      });
    }

    await tx.companyUser.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: auth.companyId,
        },
      },
      update: {
        role: toCompanyRole(payload.role),
      },
      create: {
        userId: user.id,
        companyId: auth.companyId,
        role: toCompanyRole(payload.role),
      },
    });

    return {
      userId: user.id,
      email: normalizedEmail,
      role: payload.role,
    };
  });

  return NextResponse.json({
    message: "Invitation saved",
    member,
  });
}
