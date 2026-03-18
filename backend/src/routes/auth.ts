import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, type ZodError } from "zod";

import { prisma } from "../db";
import { requireAuth } from "../lib/auth";
import {
  sendAdminRegistrationEmail,
  sendPasswordResetCodeEmail,
  sendUserRegistrationEmail,
} from "../lib/email";

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
  registrationNumber: z.string().trim().optional(),
  country: z.string().trim().min(1),
  phoneNumber: z.string().trim().optional(),
  city: z.string().trim().min(1).optional(),
  emirate: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.phoneNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phoneNumber"],
      message: "Phone number is required.",
    });
  }

  if (value.role === "BUYER" && !(value.city?.trim() || value.emirate?.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["city"],
      message: "City is required.",
    });
  }
});

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

const passwordResetConfirmSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/, "Passcode must be 6 digits."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters."),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Passwords do not match.",
    });
  }
});

type LoginBody = z.infer<typeof loginSchema>;
type RegisterBody = z.infer<typeof registerSchema>;
type PasswordResetRequestBody = z.infer<typeof passwordResetRequestSchema>;
type PasswordResetConfirmBody = z.infer<typeof passwordResetConfirmSchema>;
type JwtRole = "SELLER" | "BUYER" | "ADMIN";

type AuthUserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  role: string;
  companyUsers: Array<{
    companyId: string;
    role: string;
  }>;
};

type PasswordResetRecord = {
  id: string;
  userId: string;
  email: string;
  codeHash: string;
  attemptCount: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

const PASSWORD_RESET_CODE_LENGTH = 6;
const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_CODE_TTL_MINUTES = PASSWORD_RESET_CODE_TTL_MS / 60_000;
const PASSWORD_RESET_ACCEPTED_MESSAGE = "If an account exists for that email, a passcode has been sent.";
const PASSWORD_RESET_INVALID_MESSAGE = "The passcode is invalid or expired.";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getPasswordResetSecret(): string {
  const secret = process.env.PASSWORD_RESET_SECRET?.trim() || process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("PASSWORD_RESET_SECRET or JWT_SECRET must be configured");
  }

  return secret;
}

function generatePasswordResetCode(): string {
  return randomInt(0, 10 ** PASSWORD_RESET_CODE_LENGTH)
    .toString()
    .padStart(PASSWORD_RESET_CODE_LENGTH, "0");
}

function hashPasswordResetCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}:${getPasswordResetSecret()}`)
    .digest("hex");
}

function passwordResetCodeMatches(storedHash: string, candidateHash: string): boolean {
  if (storedHash.length !== candidateHash.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(storedHash, "utf8"), Buffer.from(candidateHash, "utf8"));
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

async function isLocalBrowserUrl(value: string | undefined): Promise<boolean> {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.trim().toLowerCase();

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

async function shouldUseSecureCookie(request: FastifyRequest): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const originHeader = request.headers.origin;
  const refererHeader = request.headers.referer;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const referer = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;

  if ((await isLocalBrowserUrl(origin)) || (await isLocalBrowserUrl(referer))) {
    return false;
  }

  const forwardedHost = request.headers["x-forwarded-host"];
  const hostHeader = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || request.headers.host || "";
  const host = hostHeader.trim().toLowerCase();

  if (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]")
  ) {
    return false;
  }

  return true;
}

async function sendPasswordResetAccepted(reply: FastifyReply): Promise<void> {
  await reply.code(200).send({
    success: true,
    message: PASSWORD_RESET_ACCEPTED_MESSAGE,
  });
}

async function sendInvalidPasswordResetCode(reply: FastifyReply): Promise<void> {
  await reply.code(400).send({
    error: "INVALID_RESET_CODE",
    message: PASSWORD_RESET_INVALID_MESSAGE,
  });
}

async function setAuthCookie(request: FastifyRequest, reply: FastifyReply, token: string): Promise<void> {
  const maxAge = await getTokenMaxAge();

  reply.setCookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await shouldUseSecureCookie(request),
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

async function loadAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({
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
}

async function loadLatestActivePasswordReset(email: string): Promise<PasswordResetRecord | null> {
  return prisma.passwordResetCode.findFirst({
    where: {
      email,
      consumedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function sendAuthSuccess(
  request: FastifyRequest,
  reply: FastifyReply,
  user: AuthUserRecord,
): Promise<void> {
  const companyLink = user.companyUsers[0] ?? null;
  const role = await mapJwtRole(user.role, companyLink?.role ?? null);
  const token = await signAuthToken({
    userId: user.id,
    role,
    companyId: companyLink?.companyId ?? undefined,
    email: user.email,
  });

  await setAuthCookie(request, reply, token);
  await reply.code(200).send({
    user: {
      id: user.id,
      email: user.email,
      role,
    },
  });
}

async function buildRegistrationNumber(payload: RegisterBody, companyId: string): Promise<string> {
  const provided = payload.registrationNumber?.trim();

  if (provided) {
    return provided;
  }

  return `AUTO-${payload.role.slice(0, 3)}-${companyId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
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
      const email = normalizeEmail(payload.email);
      const user = await loadAuthUserByEmail(email);

      if (!user || !user.passwordHash) {
        await sendUnauthorized(reply);
        return;
      }

      const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);

      if (!passwordMatches) {
        await sendUnauthorized(reply);
        return;
      }

      await sendAuthSuccess(request, reply, user);
    },
  );

  fastify.post(
    "/password-reset/request",
    async function passwordResetRequestHandler(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsed = passwordResetRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        await sendValidationError(reply, parsed.error);
        return;
      }

      const payload: PasswordResetRequestBody = parsed.data;
      const email = normalizeEmail(payload.email);
      const user = await loadAuthUserByEmail(email);

      if (!user || !user.passwordHash) {
        await sendPasswordResetAccepted(reply);
        return;
      }

      const now = new Date();
      const latestReset = await loadLatestActivePasswordReset(email);

      if (
        latestReset &&
        latestReset.expiresAt.getTime() > now.getTime() &&
        now.getTime() - latestReset.createdAt.getTime() < PASSWORD_RESET_RESEND_COOLDOWN_MS
      ) {
        await sendPasswordResetAccepted(reply);
        return;
      }

      const code = generatePasswordResetCode();
      const expiresAt = new Date(now.getTime() + PASSWORD_RESET_CODE_TTL_MS);

      await prisma.passwordResetCode.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      await prisma.passwordResetCode.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          email: user.email,
          codeHash: hashPasswordResetCode(email, code),
          expiresAt,
        },
      });

      await sendPasswordResetCodeEmail(
        {
          code,
          email: user.email,
          expiresInMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
        },
        fastify.log,
      );

      await sendPasswordResetAccepted(reply);
    },
  );

  fastify.post(
    "/password-reset/confirm",
    async function passwordResetConfirmHandler(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsed = passwordResetConfirmSchema.safeParse(request.body);

      if (!parsed.success) {
        await sendValidationError(reply, parsed.error);
        return;
      }

      const payload: PasswordResetConfirmBody = parsed.data;
      const email = normalizeEmail(payload.email);
      const user = await loadAuthUserByEmail(email);

      if (!user || !user.passwordHash) {
        await sendInvalidPasswordResetCode(reply);
        return;
      }

      const resetRecord = await loadLatestActivePasswordReset(email);
      const now = new Date();

      if (!resetRecord) {
        await sendInvalidPasswordResetCode(reply);
        return;
      }

      if (resetRecord.expiresAt.getTime() <= now.getTime()) {
        await prisma.passwordResetCode.update({
          where: {
            id: resetRecord.id,
          },
          data: {
            consumedAt: now,
          },
        });

        await sendInvalidPasswordResetCode(reply);
        return;
      }

      if (resetRecord.attemptCount >= PASSWORD_RESET_MAX_ATTEMPTS) {
        await prisma.passwordResetCode.update({
          where: {
            id: resetRecord.id,
          },
          data: {
            consumedAt: now,
          },
        });

        await sendInvalidPasswordResetCode(reply);
        return;
      }

      const codeHash = hashPasswordResetCode(email, payload.code);

      if (!passwordResetCodeMatches(resetRecord.codeHash, codeHash)) {
        const nextAttemptCount = resetRecord.attemptCount + 1;

        await prisma.passwordResetCode.update({
          where: {
            id: resetRecord.id,
          },
          data: {
            attemptCount: nextAttemptCount,
            consumedAt: nextAttemptCount >= PASSWORD_RESET_MAX_ATTEMPTS ? now : null,
          },
        });

        await sendInvalidPasswordResetCode(reply);
        return;
      }

      const consumeResult = await prisma.passwordResetCode.updateMany({
        where: {
          id: resetRecord.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      if (consumeResult.count !== 1) {
        await sendInvalidPasswordResetCode(reply);
        return;
      }

      const passwordHash = await bcrypt.hash(payload.password, 12);

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          passwordHash,
        },
      });

      await prisma.passwordResetCode.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      await sendAuthSuccess(request, reply, user);
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
      const email = normalizeEmail(payload.email);
      const passwordHash = await bcrypt.hash(payload.password, 12);
      const userId = randomUUID();
      const companyId = randomUUID();
      const companyUserId = randomUUID();
      const userStatus = "PENDING_APPROVAL";
      const companyStatus = "PENDING_APPROVAL";
      const companyUserRole = payload.role === "SELLER" ? "SELLER_MANAGER" : "BUYER_BIDDER";
      const registrationNumber = await buildRegistrationNumber(payload, companyId);
      const city = payload.city?.trim() || payload.emirate?.trim() || null;

      try {
        const [createdUser] = await prisma.$transaction([
          prisma.user.create({
            data: {
              id: userId,
              email,
              passwordHash,
              role: payload.role,
              status: userStatus,
              emirate: city,
            },
          }),
          prisma.company.create({
            data: {
              id: companyId,
              name: payload.companyName,
              phone: payload.phoneNumber?.trim() || null,
              registrationNumber,
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

        await Promise.all([
          sendUserRegistrationEmail(
            {
              companyName: payload.companyName,
              email: createdUser.email,
              role: createdUser.role as "SELLER" | "BUYER",
              status: userStatus,
            },
            fastify.log,
          ),
          sendAdminRegistrationEmail(
            {
              companyName: payload.companyName,
              country: payload.country.trim(),
              email: createdUser.email,
              emirate: city,
              phoneNumber: payload.phoneNumber?.trim() || null,
              registrationNumber: payload.registrationNumber?.trim() || null,
              role: createdUser.role as "SELLER" | "BUYER",
              status: userStatus,
            },
            fastify.log,
          ),
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
          createdAt: user.createdAt,
          kycVerified: user.kycVerified,
          companyUsers: user.companyUsers.map((companyUser) => ({
            id: companyUser.id,
            companyId: companyUser.companyId,
            role: companyUser.role,
            company: companyUser.company
              ? {
                  id: companyUser.company.id,
                  name: companyUser.company.name,
                  phone: companyUser.company.phone,
                  registrationNumber: companyUser.company.registrationNumber,
                  country: companyUser.company.country,
                  buyerTier: companyUser.company.buyerTier,
                  status: companyUser.company.status,
                  createdAt: companyUser.company.createdAt,
                }
              : null,
          })),
        },
      });
    },
  );
}
