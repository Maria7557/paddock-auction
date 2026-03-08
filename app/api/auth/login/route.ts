import bcrypt from "bcryptjs";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";
import { signJwt } from "@/src/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

type JwtRole = "SELLER" | "BUYER" | "ADMIN";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapRole(input: {
  userRole: string;
  companyUserRole: string | null;
}): JwtRole {
  if (input.userRole === "ADMIN" || input.userRole === "SUPER_ADMIN") {
    return "ADMIN";
  }

  if (input.companyUserRole === "SELLER_MANAGER") {
    return "SELLER";
  }

  return "BUYER";
}

export async function POST(request: Request): Promise<Response> {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return json(400, {
      error: "INVALID_REQUEST",
      message: "Request body must be valid JSON",
    });
  }

  const parsed = loginSchema.safeParse(requestBody);

  if (!parsed.success) {
    return json(400, {
      error: "INVALID_REQUEST",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const payload = parsed.data;
  const email = normalizeEmail(payload.email);

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
      role: true,
      companyUsers: {
        select: {
          companyId: true,
          role: true,
        },
        take: 1,
      },
    },
  });

  if (!user || !user.passwordHash) {
    return json(401, {
      error: "INVALID_CREDENTIALS",
    });
  }

  const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);

  if (!passwordMatches) {
    return json(401, {
      error: "INVALID_CREDENTIALS",
    });
  }

  if (user.status !== "ACTIVE") {
    return json(403, {
      error: "ACCOUNT_PENDING_APPROVAL",
      status: user.status,
    });
  }

  const companyLink = user.companyUsers[0] ?? null;
  const role = mapRole({
    userRole: user.role,
    companyUserRole: companyLink?.role ?? null,
  });
  const companyId = companyLink?.companyId ?? null;

  try {
    const token = await signJwt({
      userId: user.id,
      role,
      companyId: companyId ?? undefined,
    });

    return json(200, {
      token,
      userId: user.id,
      role,
      companyId,
    });
  } catch {
    return json(500, {
      error: "INTERNAL_ERROR",
    });
  }
}
