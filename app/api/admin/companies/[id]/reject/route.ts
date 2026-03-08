export const runtime = "nodejs";

import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

import { createAuditLog, json, requireAdmin } from "../../../_lib/admin_route_utils";

const rejectCompanySchema = z.object({
  reason: z.string().trim().min(1),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveCompanyId(context: RouteContext): Promise<string> {
  const resolved = await context.params;
  return resolved.id;
}

export const POST = withStructuredMutationLogging(
  async (request: Request, context: RouteContext): Promise<Response> => {
    const adminContext = requireAdmin(request);

    if (adminContext instanceof Response) {
      return adminContext;
    }

    const companyId = (await resolveCompanyId(context)).trim();

    if (!companyId) {
      return json(400, {
        error: "INVALID_COMPANY_ID",
      });
    }

    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      return json(400, {
        error: "INVALID_REQUEST",
        message: "Request body must be valid JSON",
      });
    }

    const parsed = rejectCompanySchema.safeParse(requestBody);

    if (!parsed.success) {
      return json(400, {
        error: "INVALID_REQUEST",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const correlationId = request.headers.get("x-correlation-id")?.trim();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: {
          id: companyId,
        },
        include: {
          users: {
            where: {
              role: "SELLER_MANAGER",
            },
            select: {
              userId: true,
            },
          },
        },
      });

      if (!company) {
        return null;
      }

      await tx.company.update({
        where: {
          id: companyId,
        },
        data: {
          status: "REJECTED",
        },
      });

      const sellerUserIds = company.users.map((membership) => membership.userId);

      if (sellerUserIds.length > 0) {
        await tx.user.updateMany({
          where: {
            id: {
              in: sellerUserIds,
            },
          },
          data: {
            status: "REJECTED",
          },
        });
      }

      await createAuditLog(tx, {
        actorId: adminContext.actorId,
        action: "COMPANY_REJECTED",
        entityType: "Company",
        entityId: companyId,
        correlationId,
        idempotencyKey,
        payload: {
          companyId,
          status: "REJECTED",
          reason: parsed.data.reason,
          sellerUserIds,
        },
      });

      return {
        companyId,
        status: "REJECTED",
      } as const;
    });

    if (!result) {
      return json(404, {
        error: "COMPANY_NOT_FOUND",
      });
    }

    return json(200, result);
  },
);
