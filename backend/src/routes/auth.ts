import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, type ZodError } from "zod";

import { prisma } from "../db";
import { requireAuth } from "../lib/auth";

const { loadJose } = require("../lib/jose-runtime.cjs") as {
  loadJose: () => Promise<typeof import("jose")>;
};

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(["SELLER", "BUYER"]),
  companyName: z.string().trim().min(1),
  registrationNumber: z.string().trim().min(1),
  country: z.string().trim().min(1),
});

type LoginBody = z.infer<typeof loginSchema>;
type RegisterBody = z.infer<typeof registerSchema>;
type JwtRole = "SELLER" | "BUYER" | "ADMIN";

async function normalizeEmail(email: string): Promise<string> {
  return email.trim().toLowerCase();
}

async function getJwtSecret(): Promise<Uint8Array> {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return new TextEncoder().encode(secret);
}

async function getTokenMaxAge(): Promise<number> {
  return 60 * 60 * 24 * 7;
}

async function mapJwtRole(userRole: string, companyUserRole: string | null): Promise<JwtRole> {
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return "ADMIN";
  }

  if (companyUserRole === "SELLER_MANAGER") {
    return "SELLER";
  }

  return "BUYER";
}

async function signAuthToken(input: {
  userId: string;
  role: JwtRole;
  companyId?: string;
  email: string;
}): Promise<string> {
  const secret = await getJwtSecret();
  const { SignJWT } = await loadJose();

  return new SignJWT({
    role: input.role,
    companyId: input.companyId,
    email: input.email,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

async function sendValidationError(reply: FastifyReply, error: ZodError): Promise<void> {
  await reply.code(400).send({
    error: "INVALID_REQUEST",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

async function sendUnauthorized(reply: FastifyReply): Promise<void> {
  await reply.code(401).send({
    error: "Unauthorized",
  });
}

async function setAuthCookie(reply: FastifyReply, token: string): Promise<void> {
  const maxAge = await getTokenMaxAge();

  reply.setCookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

async function isUniqueConstraintError(error: unknown): Promise<boolean> {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/login",
    async function loginHandler(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsed = loginSchema.safeParse(request.body);

      if (!parsed.success) {
        await sendValidationError(reply, parsed.error);
        return;
      }

      const payload: LoginBody = parsed.data;
      const email = await normalizeEmail(payload.email);
      const user = await prisma.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          role: true,
          companyUsers: {
            select: {
              companyId: true,
              role: true,
            },
            take: 1,
          },
        },
      });

      if (!user || !user.passwordHash) {
        await sendUnauthorized(reply);
        return;
      }

      const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);

      if (!passwordMatches) {
        await sendUnauthorized(reply);
        return;
      }

      const companyLink = user.companyUsers[0] ?? null;
      const role = await mapJwtRole(user.role, companyLink?.role ?? null);
      const token = await signAuthToken({
        userId: user.id,
        role,
        companyId: companyLink?.companyId ?? undefined,
        email: user.email,
      });

      await setAuthCookie(reply, token);
      await reply.code(200).send({
        user: {
          id: user.id,
          email: user.email,
          role,
        },
      });
    },
  );

  fastify.post(
    "/register",
    async function registerHandler(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsed = registerSchema.safeParse(request.body);

      if (!parsed.success) {
        await sendValidationError(reply, parsed.error);
        return;
      }

      const payload: RegisterBody = parsed.data;
      const email = await normalizeEmail(payload.email);
      const passwordHash = await bcrypt.hash(payload.password, 12);
      const userId = randomUUID();
      const companyId = randomUUID();
      const companyUserId = randomUUID();
      const userStatus = payload.role === "BUYER" ? "ACTIVE" : "PENDING_APPROVAL";
      const companyStatus = payload.role === "BUYER" ? "ACTIVE" : "PENDING_APPROVAL";
      const companyUserRole = payload.role === "SELLER" ? "SELLER_MANAGER" : "BUYER_BIDDER";

      try {
        const [createdUser] = await prisma.$transaction([
          prisma.user.create({
            data: {
              id: userId,
              email,
              passwordHash,
              role: payload.role,
              status: userStatus,
            },
          }),
          prisma.company.create({
            data: {
              id: companyId,
              name: payload.companyName,
              registrationNumber: payload.registrationNumber.trim(),
              country: payload.country.trim(),
              status: companyStatus,
            },
          }),
          prisma.companyUser.create({
            data: {
              id: companyUserId,
              userId,
              companyId,
              role: companyUserRole,
            },
          }),
        ]);

        await reply.code(201).send({
          user: {
            id: createdUser.id,
            email: createdUser.email,
            role: createdUser.role,
          },
        });
      } catch (error) {
        if (await isUniqueConstraintError(error)) {
          await reply.code(409).send({
            error: "CONFLICT",
          });
          return;
        }

        throw error;
      }
    },
  );

  fastify.post(
    "/logout",
    async function logoutHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
      reply.clearCookie("token", {
        path: "/",
      });

      await reply.code(200).send({
        success: true,
      });
    },
  );

  fastify.get(
    "/me",
    {
      preHandler: requireAuth,
    },
    async function meHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const userId = request.auth?.userId;

      if (!userId) {
        await sendUnauthorized(reply);
        return;
      }

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        include: {
          companyUsers: {
            include: {
              company: true,
            },
          },
        },
      });

      if (!user) {
        await sendUnauthorized(reply);
        return;
      }

      await reply.code(200).send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          kycVerified: user.kycVerified,
          companyUsers: user.companyUsers.map((companyUser) => ({
            id: companyUser.id,
            companyId: companyUser.companyId,
            role: companyUser.role,
            company: companyUser.company
              ? {
                  id: companyUser.company.id,
                  name: companyUser.company.name,
                  registrationNumber: companyUser.company.registrationNumber,
                  country: companyUser.company.country,
                  status: companyUser.company.status,
                }
              : null,
          })),
        },
      });
    },
  );
}
