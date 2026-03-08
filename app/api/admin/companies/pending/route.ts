export const runtime = "nodejs";

import prisma from "@/src/infrastructure/database/prisma";

import { json, requireAdmin } from "../../_lib/admin_route_utils";

export async function GET(request: Request): Promise<Response> {
  const adminContext = requireAdmin(request);

  if (adminContext instanceof Response) {
    return adminContext;
  }

  const companies = await prisma.company.findMany({
    where: {
      status: "PENDING_APPROVAL",
    },
    include: {
      users: {
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              email: true,
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
    companies: companies.map((company) => ({
      id: company.id,
      name: company.name,
      status: company.status,
      createdAt: company.createdAt.toISOString(),
      companyUsers: company.users.map((membership) => ({
        id: membership.id,
        role: membership.role,
        userId: membership.user.id,
        userEmail: membership.user.email,
        userStatus: membership.user.status,
      })),
    })),
  });
}
