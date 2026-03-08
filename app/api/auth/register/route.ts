export const runtime = "nodejs";

import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

const registerSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8),
    role: z.enum(["SELLER", "BUYER"]),
    companyName: z.string().trim().min(1).optional(),
  })
  .superRefine((payload, context) => {
    if (payload.role === "SELLER" && !payload.companyName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "companyName is required for SELLER registration",
      });
    }
  });

const DEFAULT_BUYER_COMPANY_REGISTRATION = "DEFAULT-BUYER-COMPANY";
const DEFAULT_BUYER_COMPANY_NAME = "Default Buyer Company";

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

  const parsed = registerSchema.safeParse(requestBody);

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

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return json(409, {
      error: "EMAIL_ALREADY_EXISTS",
    });
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);

  try {
    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: payload.role,
          status: payload.role === "BUYER" ? "ACTIVE" : "PENDING_APPROVAL",
        },
      });

      if (payload.role === "SELLER") {
        const sellerCompany = await tx.company.create({
          data: {
            name: payload.companyName!,
            country: "AE",
            registrationNumber: `SELLER-${randomUUID()}`,
            status: "PENDING_APPROVAL",
          },
        });

        await tx.companyUser.create({
          data: {
            userId: user.id,
            companyId: sellerCompany.id,
            role: "SELLER_MANAGER",
          },
        });

        return user;
      }

      const buyerCompany = await tx.company.upsert({
        where: {
          registrationNumber: DEFAULT_BUYER_COMPANY_REGISTRATION,
        },
        update: {},
        create: {
          name: DEFAULT_BUYER_COMPANY_NAME,
          country: "AE",
          registrationNumber: DEFAULT_BUYER_COMPANY_REGISTRATION,
          status: "ACTIVE",
        },
      });

      await tx.companyUser.create({
        data: {
          userId: user.id,
          companyId: buyerCompany.id,
          role: "BUYER_BIDDER",
        },
      });

      return user;
    });

    return json(201, {
      userId: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
      status: createdUser.status,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return json(409, {
        error: "EMAIL_ALREADY_EXISTS",
      });
    }

    return json(500, {
      error: "INTERNAL_ERROR",
    });
  }
}
