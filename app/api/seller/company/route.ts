export const runtime = "nodejs";

import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

const companyProfileSchema = z.object({
  companyName: z.string().trim().min(1),
  tradeLicenseNumber: z.string().trim().min(1),
  tradeLicenseExpiry: z.string().trim().optional(),
  vatRegistrationNumber: z.string().trim().optional(),
  operatingRegion: z.string().trim().min(1),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  primaryContactEmail: z.string().trim().email().optional(),
  primaryContactPhone: z.string().trim().optional(),
  logoUrl: z.string().trim().optional(),
});

function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const [company, profileLog] = await Promise.all([
    prisma.company.findUnique({
      where: { id: auth.companyId },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        country: true,
        status: true,
      },
    }),
    prisma.auditLog.findFirst({
      where: {
        entityType: "SELLER_COMPANY_PROFILE",
        entityId: auth.companyId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        payload: true,
      },
    }),
  ]);

  if (!company) {
    return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });
  }

  const profilePayload = (profileLog?.payload ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    profile: {
      companyName: company.name,
      tradeLicenseNumber: company.registrationNumber,
      operatingRegion: company.country,
      status: company.status,
      tradeLicenseExpiry: typeof profilePayload.tradeLicenseExpiry === "string" ? profilePayload.tradeLicenseExpiry : "",
      vatRegistrationNumber:
        typeof profilePayload.vatRegistrationNumber === "string" ? profilePayload.vatRegistrationNumber : "",
      addressLine1: typeof profilePayload.addressLine1 === "string" ? profilePayload.addressLine1 : "",
      addressLine2: typeof profilePayload.addressLine2 === "string" ? profilePayload.addressLine2 : "",
      city: typeof profilePayload.city === "string" ? profilePayload.city : "",
      primaryContactEmail:
        typeof profilePayload.primaryContactEmail === "string" ? profilePayload.primaryContactEmail : "",
      primaryContactPhone:
        typeof profilePayload.primaryContactPhone === "string" ? profilePayload.primaryContactPhone : "",
      logoUrl: typeof profilePayload.logoUrl === "string" ? profilePayload.logoUrl : "",
    },
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

  const parsed = companyProfileSchema.safeParse(body);

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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: {
          id: auth.companyId,
        },
        data: {
          name: payload.companyName,
          registrationNumber: payload.tradeLicenseNumber,
          country: payload.operatingRegion,
        },
      });

      const extraPayload = {
        tradeLicenseExpiry: payload.tradeLicenseExpiry ?? "",
        vatRegistrationNumber: payload.vatRegistrationNumber ?? "",
        addressLine1: payload.addressLine1 ?? "",
        addressLine2: payload.addressLine2 ?? "",
        city: payload.city ?? "",
        primaryContactEmail: payload.primaryContactEmail ?? "",
        primaryContactPhone: payload.primaryContactPhone ?? "",
        logoUrl: payload.logoUrl ?? "",
      };

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          action: "SELLER_COMPANY_PROFILE_UPDATED",
          entityType: "SELLER_COMPANY_PROFILE",
          entityId: auth.companyId,
          payload: extraPayload,
          payloadHash: payloadHash(extraPayload),
        },
      });
    });
  } catch (error) {
    const maybePrisma = error as { code?: string };

    if (maybePrisma.code === "P2002") {
      return NextResponse.json(
        {
          error: "DUPLICATE_TRADE_LICENSE",
          message: "Trade license number already exists",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ message: "Company profile updated" });
}
