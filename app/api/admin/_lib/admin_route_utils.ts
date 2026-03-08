import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

export type AdminHeaders = {
  actorId: string;
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export function requireAdmin(request: Request): AdminHeaders | Response {
  const role = request.headers.get("x-user-role")?.trim();

  if (role !== "ADMIN") {
    return json(403, {
      error: "FORBIDDEN",
    });
  }

  const actorId = request.headers.get("x-user-id")?.trim();

  if (!actorId) {
    return json(401, {
      error: "UNAUTHORIZED",
    });
  }

  return {
    actorId,
  };
}

function createPayloadHash(payload: Prisma.InputJsonValue): string {
  const serialized = JSON.stringify(payload);
  return createHash("sha256").update(serialized).digest("hex");
}

export async function createAuditLog(
  client: Prisma.TransactionClient | PrismaClient,
  input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    idempotencyKey?: string;
    correlationId?: string;
    payload: Prisma.InputJsonValue;
  },
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      payloadHash: createPayloadHash(input.payload),
      payload: input.payload,
    },
  });
}
