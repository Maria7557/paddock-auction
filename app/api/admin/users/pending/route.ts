export const runtime = "nodejs";

import { z } from "zod";
import type { Prisma } from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";

import { json, requireAdmin } from "../../_lib/admin_route_utils";

const statusQuerySchema = z
  .enum(["PENDING_APPROVAL", "BLOCKED", "ACTIVE", "PENDING_KYC"])
  .optional();

export async function GET(request: Request): Promise<Response> {
  const adminContext = requireAdmin(request);

  if (adminContext instanceof Response) {
    return adminContext;
  }

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status")?.trim().toUpperCase();
  const status = statusQuerySchema.safeParse(requestedStatus);

  if (!status.success && requestedStatus) {
    return json(400, {
      error: "INVALID_STATUS",
      message: "status must be one of PENDING_APPROVAL, BLOCKED, ACTIVE, PENDING_KYC",
    });
  }

  let whereClause: Prisma.UserWhereInput;

  if (status.data === "PENDING_KYC") {
    whereClause = {
      role: "BUYER",
      status: "ACTIVE",
      kycVerified: false,
    };
  } else if (status.data) {
    whereClause = {
      status: status.data,
    };
  } else {
    whereClause = {
      status: {
        in: ["PENDING_APPROVAL", "BLOCKED"],
      },
    };
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    include: {
      wallet: {
        select: {
          balance: true,
        },
      },
      companyUsers: {
        select: {
          id: true,
          role: true,
          company: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return json(200, {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      kycVerified: user.kycVerified,
      walletBalance: Number(user.wallet?.balance ?? 0),
      hasDeposit: Number(user.wallet?.balance ?? 0) > 0,
      createdAt: user.createdAt.toISOString(),
      companyUsers: user.companyUsers.map((membership) => ({
        id: membership.id,
        role: membership.role,
        companyId: membership.company.id,
        companyName: membership.company.name,
        companyStatus: membership.company.status,
      })),
    })),
  });
}
