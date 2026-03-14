import type { FastifyReply, FastifyRequest } from "fastify";
import type { JWTPayload } from "jose";

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

export async function requireAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);

  if (reply.sent) {
    return;
  }

  if (request.auth?.role !== "ADMIN") {
    await sendUnauthorized(reply);
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
