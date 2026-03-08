export const runtime = "nodejs";

import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

import { createAuditLog, json, requireAdmin } from "../../../_lib/admin_route_utils";

const blockUserSchema = z.object({
  reason: z.string().trim().min(1),
});

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

    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      return json(400, {
        error: "INVALID_REQUEST",
        message: "Request body must be valid JSON",
      });
    }

    const parsed = blockUserSchema.safeParse(requestBody);

    if (!parsed.success) {
      return json(400, {
        error: "INVALID_REQUEST",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingUser) {
      return json(404, {
        error: "USER_NOT_FOUND",
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
          status: "BLOCKED",
        },
      });

      await createAuditLog(tx, {
        actorId: adminContext.actorId,
        action: "USER_BLOCKED",
        entityType: "User",
        entityId: userId,
        correlationId,
        idempotencyKey,
        payload: {
          userId,
          status: "BLOCKED",
          reason: parsed.data.reason,
        },
      });
    });

    return json(200, {
      userId,
      status: "BLOCKED",
    });
  },
);
