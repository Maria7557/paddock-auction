export const runtime = "nodejs";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

import { createAuditLog, json, requireAdmin } from "../../../_lib/admin_route_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveUserId(context: RouteContext): Promise<string> {
  const resolved = await context.params;
  return resolved.id;
}

export const POST = withStructuredMutationLogging(
  async (request: Request, context: RouteContext): Promise<Response> => {
    const adminContext = requireAdmin(request);

    if (adminContext instanceof Response) {
      return adminContext;
    }

    const userId = (await resolveUserId(context)).trim();

    if (!userId) {
      return json(400, {
        error: "INVALID_USER_ID",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!existingUser) {
      return json(404, {
        error: "USER_NOT_FOUND",
      });
    }

    if (existingUser.role !== "BUYER") {
      return json(400, {
        error: "NOT_A_BUYER",
      });
    }

    const correlationId = request.headers.get("x-correlation-id")?.trim();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          kycVerified: true,
        },
      });

      await createAuditLog(tx, {
        actorId: adminContext.actorId,
        action: "BUYER_KYC_APPROVED",
        entityType: "User",
        entityId: userId,
        correlationId,
        idempotencyKey,
        payload: {
          userId,
          kycVerified: true,
        },
      });
    });

    return json(200, {
      userId,
      kycVerified: true,
    });
  },
);
