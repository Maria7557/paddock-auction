import type { FastifyReply, FastifyRequest } from "fastify";
import type { JWTPayload } from "jose";

import { prisma } from "../db";

const { jwtVerify } = require("./jose-runtime.cjs") as {
  jwtVerify: (
    token: string,
    secret: Uint8Array,
    options: { algorithms: string[] },
  ) => Promise<{ payload: JWTPayload & Record<string, unknown> }>;
};

export type AuthTokenPayload = JWTPayload & {
  userId: string;
  role: string;
  companyId?: string;
  kycVerified?: boolean;
};

export type BuyerAccessContext = {
  userId: string;
  companyId: string;
  userStatus: string;
  companyStatus: string;
  kycVerified: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthTokenPayload;
  }
}

const encoder = new TextEncoder();

async function getJwtSecret(): Promise<Uint8Array> {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return encoder.encode(secret);
}

async function readCookieToken(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const [rawKey, ...rawValueParts] = segment.trim().split("=");

    if (rawKey !== "token") {
      continue;
    }

    const value = rawValueParts.join("=").trim();

    if (value.length > 0) {
      return value;
    }
  }

  return null;
}

async function getTokenFromRequest(request: FastifyRequest): Promise<string | null> {
  const authorization = request.headers.authorization?.trim() ?? "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();

    if (token.length > 0) {
      return token;
    }
  }

  const cookieToken = request.cookies.token?.trim();

  if (cookieToken && cookieToken.length > 0) {
    return cookieToken;
  }

  return readCookieToken(request.headers.cookie);
}

async function sendUnauthorized(reply: FastifyReply): Promise<void> {
  await reply.code(401).send({ error: "Unauthorized" });
}

async function sendForbidden(reply: FastifyReply): Promise<void> {
  await reply.code(403).send({ error: "Forbidden" });
}

export async function verifyToken(token: string): Promise<AuthTokenPayload> {
  const secret = await getJwtSecret();
  const verified = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });
  const userId = verified.payload.sub;
  const role = verified.payload.role;
  const companyId = verified.payload.companyId;
  const kycVerified = verified.payload.kycVerified;

  if (typeof userId !== "string" || typeof role !== "string") {
    throw new Error("Invalid token payload");
  }

  return {
    ...verified.payload,
    sub: userId,
    userId,
    role,
    companyId: typeof companyId === "string" ? companyId : undefined,
    kycVerified: typeof kycVerified === "boolean" ? kycVerified : false,
  };
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const token = await getTokenFromRequest(request);

    if (!token) {
      await sendUnauthorized(reply);
      return;
    }

    const payload = await verifyToken(token);

    request.auth = payload;
  } catch {
    await sendUnauthorized(reply);
  }
}

export async function hydrateAuthIfPresent(request: FastifyRequest): Promise<void> {
  try {
    const token = await getTokenFromRequest(request);

    if (!token) {
      return;
    }

    request.auth = await verifyToken(token);
  } catch {
    // Public routes should continue without auth when the token is missing or invalid.
  }
}

export async function requireAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);

  if (reply.sent) {
    return;
  }

  if (request.auth?.role !== "ADMIN") {
    await sendForbidden(reply);
  }
}

export async function requireSellerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);

  if (reply.sent) {
    return;
  }

  if (request.auth?.role !== "SELLER" || !request.auth.companyId) {
    await sendUnauthorized(reply);
  }
}

export async function loadBuyerAccessContext(
  request: FastifyRequest,
): Promise<BuyerAccessContext | null> {
  const userId = request.auth?.userId?.trim();
  const companyId = request.auth?.companyId?.trim();

  if (!userId || request.auth?.role !== "BUYER" || !companyId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      role: true,
      status: true,
      kycVerified: true,
      companyUsers: {
        where: {
          companyId,
        },
        select: {
          companyId: true,
          company: {
            select: {
              status: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  const membership = user?.companyUsers[0];
  const companyStatus = membership?.company?.status?.trim();

  if (!user || user.role !== "BUYER" || !membership?.companyId || !companyStatus) {
    return null;
  }

  if (request.auth) {
    request.auth.kycVerified = user.kycVerified;
  }

  return {
    userId: user.id,
    companyId: membership.companyId,
    userStatus: user.status,
    companyStatus,
    kycVerified: user.kycVerified,
  };
}

export async function requireActiveBuyerAccount(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<BuyerAccessContext | null> {
  const context = await loadBuyerAccessContext(request);

  if (!context) {
    await sendUnauthorized(reply);
    return null;
  }

  const userStatus = context.userStatus.toUpperCase();
  const companyStatus = context.companyStatus.toUpperCase();
  const isPending =
    userStatus === "PENDING_APPROVAL" ||
    companyStatus === "PENDING_APPROVAL" ||
    companyStatus === "PENDING";

  if (isPending) {
    await reply.code(403).send({
      error: "ACCOUNT_PENDING_APPROVAL",
      message: "Account pending admin approval. Buying is disabled until activation.",
    });
    return null;
  }

  if (userStatus !== "ACTIVE" || companyStatus !== "ACTIVE") {
    await reply.code(403).send({
      error: "ACCOUNT_INACTIVE",
      message: "Account is inactive. Buying is unavailable.",
    });
    return null;
  }

  return context;
}
