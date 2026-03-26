import { createHash, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    company: {
      create: vi.fn(),
    },
    companyUser: {
      create: vi.fn(),
    },
    passwordResetCode: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

const { mockEmail } = vi.hoisted(() => ({
  mockEmail: {
    sendAdminRegistrationEmail: vi.fn(),
    sendPasswordResetCodeEmail: vi.fn(),
    sendUserRegistrationEmail: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/email", () => mockEmail);

import { buildServer } from "../../server";

const jwtSecret = "test-secret-32-chars-long-enough!!";

async function makeValidToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);

  return new SignJWT({ role: payload.role, companyId: payload.companyId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

function makeUser(
  overrides: Partial<{
    id: string;
    email: string;
    passwordHash: string | null;
    role: string;
    companyUsers: Array<{ companyId: string; role: string }>;
  }> = {},
) {
  return {
    id: overrides.id ?? randomUUID(),
    email: overrides.email ?? "seller@example.com",
    passwordHash:
      overrides.passwordHash ??
      "$2b$12$.71Ewbl6Js6eYz2za6d6DOZNhpMGt5ULUUnC5i8ntZf2z4oqCQhUu",
    role: overrides.role ?? "SELLER",
    companyUsers: overrides.companyUsers ?? [{ companyId: "company-uuid-1", role: "SELLER_MANAGER" }],
  };
}

function makePasswordResetHash(email: string, code: string): string {
  const secret = process.env.PASSWORD_RESET_SECRET?.trim() || process.env.JWT_SECRET?.trim() || "";

  return createHash("sha256")
    .update(`${email.trim().toLowerCase()}:${code}:${secret}`)
    .digest("hex");
}

let server: FastifyInstance;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "test";
  server = await buildServer();
  await server.ready();
  request = supertest(server.server);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/login", () => {
  it("returns 200 and sets httpOnly cookie for valid credentials", async () => {
    const user = makeUser();

    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request
      .post("/api/auth/login")
      .send({ email: "seller@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("seller@example.com");
    expect(res.body.user.role).toBe("SELLER");
    expect(res.headers["set-cookie"]).toBeDefined();

    const cookie = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"][0]
      : res.headers["set-cookie"];

    expect(cookie).toContain("token=");
    expect(cookie).toContain("HttpOnly");
  });

  it("does not mark cookie as Secure for localhost even in production mode", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());

    const res = await request
      .post("/api/auth/login")
      .set("host", "localhost:4000")
      .send({ email: "seller@example.com", password: "password123" });

    process.env.NODE_ENV = previousNodeEnv;

    const cookie = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"][0]
      : res.headers["set-cookie"];

    expect(res.status).toBe(200);
    expect(cookie).not.toContain("Secure");
  });

  it("does not mark cookie as Secure when proxied from localhost origin", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());

    const res = await request
      .post("/api/auth/login")
      .set("host", "backend:4000")
      .set("origin", "http://localhost:3000")
      .send({ email: "seller@example.com", password: "password123" });

    process.env.NODE_ENV = previousNodeEnv;

    const cookie = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"][0]
      : res.headers["set-cookie"];

    expect(res.status).toBe(200);
    expect(cookie).not.toContain("Secure");
  });

  it("returns 200 with role BUYER for buyer account", async () => {
    const user = makeUser({
      email: "buyer@example.com",
      role: "BUYER",
      companyUsers: [{ companyId: "co-2", role: "BUYER_BIDDER" }],
    });

    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request
      .post("/api/auth/login")
      .send({ email: "buyer@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("BUYER");
  });

  it("returns 200 with role ADMIN for admin account", async () => {
    const user = makeUser({
      email: "admin@example.com",
      role: "ADMIN",
      companyUsers: [],
    });

    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ADMIN");
  });

  it("normalizes email to lowercase before lookup", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await request
      .post("/api/auth/login")
      .send({ email: "SELLER@EXAMPLE.COM", password: "password123" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "seller@example.com" },
      }),
    );
  });

  it("returns 401 when user not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 when password is wrong", async () => {
    const user = makeUser();

    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request
      .post("/api/auth/login")
      .send({ email: "seller@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when user has no passwordHash", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...makeUser(),
      passwordHash: null,
    });

    const res = await request
      .post("/api/auth/login")
      .send({ email: "seller@example.com", password: "password123" });

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
    expect(res.body.issues).toBeDefined();
  });

  it("returns 400 when password is empty", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ email: "seller@example.com", password: "" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing", async () => {
    const res = await request.post("/api/auth/login").send({});

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/register", () => {
  const validSellerBody = {
    email: "newseller@example.com",
    password: "securepass99",
    role: "SELLER",
    companyName: "Fleet Corp LLC",
    country: "United Arab Emirates",
    phoneNumber: "+971501234567",
  } as const;

  const validBuyerBody = {
    email: "newbuyer@example.com",
    password: "securepass99",
    role: "BUYER",
    companyName: "Buyer Co",
    country: "United Arab Emirates",
    city: "Dubai",
    phoneNumber: "+971501234567",
  } as const;

  it("returns 201 for valid seller registration", async () => {
    const createdUser = {
      id: randomUUID(),
      email: validSellerBody.email,
      role: "SELLER",
    };

    mockPrisma.$transaction.mockResolvedValue([createdUser]);

    const res = await request.post("/api/auth/register").send(validSellerBody);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(validSellerBody.email);
    expect(res.body.user.role).toBe("SELLER");
    expect(mockEmail.sendUserRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: validSellerBody.companyName,
        email: validSellerBody.email,
        role: "SELLER",
        status: "PENDING_APPROVAL",
      }),
      expect.anything(),
    );
    expect(mockEmail.sendAdminRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: validSellerBody.companyName,
        country: validSellerBody.country,
        email: validSellerBody.email,
        phoneNumber: validSellerBody.phoneNumber,
        registrationNumber: null,
        role: "SELLER",
        status: "PENDING_APPROVAL",
      }),
      expect.anything(),
    );
  });

  it("returns 201 for valid buyer registration", async () => {
    const createdUser = {
      id: randomUUID(),
      email: validBuyerBody.email,
      role: "BUYER",
    };

    mockPrisma.$transaction.mockResolvedValue([createdUser]);

    const res = await request.post("/api/auth/register").send(validBuyerBody);

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("BUYER");
    expect(mockEmail.sendUserRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: validBuyerBody.companyName,
        email: validBuyerBody.email,
        role: "BUYER",
        status: "ACTIVE",
      }),
      expect.anything(),
    );
    expect(mockEmail.sendAdminRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: validBuyerBody.companyName,
        country: validBuyerBody.country,
        email: validBuyerBody.email,
        emirate: validBuyerBody.city,
        phoneNumber: validBuyerBody.phoneNumber,
        registrationNumber: null,
        role: "BUYER",
        status: "ACTIVE",
      }),
      expect.anything(),
    );
  });

  it("calls $transaction for atomic User + Company + CompanyUser creation", async () => {
    const createdUser = {
      id: randomUUID(),
      email: validSellerBody.email,
      role: "SELLER",
    };

    mockPrisma.$transaction.mockResolvedValue([createdUser]);

    await request.post("/api/auth/register").send(validSellerBody);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 409 on duplicate email (Prisma P2002)", async () => {
    const prismaConflict = Object.assign(new Error("Unique constraint"), { code: "P2002" });

    mockPrisma.$transaction.mockRejectedValue(prismaConflict);

    const res = await request.post("/api/auth/register").send(validSellerBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("CONFLICT");
  });

  it("returns 400 when password is too short", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({ ...validSellerBody, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });

  it("returns 400 for invalid role value", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({ ...validSellerBody, role: "SUPERUSER" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when companyName is empty", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({ ...validSellerBody, companyName: "" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when seller phone number is missing", async () => {
    const { phoneNumber: _phoneNumber, ...payload } = validSellerBody;

    const res = await request.post("/api/auth/register").send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
    expect(res.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "phoneNumber",
        }),
      ]),
    );
  });

  it("returns 400 when buyer city is missing", async () => {
    const { city: _city, ...payload } = validBuyerBody;

    const res = await request.post("/api/auth/register").send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
    expect(res.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "city",
        }),
      ]),
    );
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request.post("/api/auth/register").send({ email: "x@example.com" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/password-reset/request", () => {
  it("returns a generic success response and sends a passcode for a known account", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({
        email: "buyer@example.com",
        role: "BUYER",
        companyUsers: [{ companyId: "co-2", role: "BUYER_BIDDER" }],
      }),
    );
    mockPrisma.passwordResetCode.findFirst.mockResolvedValue(null);
    mockPrisma.passwordResetCode.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.passwordResetCode.create.mockResolvedValue({ id: randomUUID() });

    const res = await request
      .post("/api/auth/password-reset/request")
      .send({ email: "BUYER@EXAMPLE.COM" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("If an account exists");
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "buyer@example.com" },
      }),
    );
    expect(mockPrisma.passwordResetCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "buyer@example.com",
          userId: expect.any(String),
        }),
      }),
    );
    expect(mockEmail.sendPasswordResetCodeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "buyer@example.com",
        expiresInMinutes: 10,
        code: expect.stringMatching(/^\d{6}$/),
      }),
      expect.anything(),
    );
  });

  it("returns the same success response when the account does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request
      .post("/api/auth/password-reset/request")
      .send({ email: "missing@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockEmail.sendPasswordResetCodeEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  it("updates the password, consumes the code, and logs the user in", async () => {
    const user = makeUser({
      email: "buyer@example.com",
      role: "BUYER",
      companyUsers: [{ companyId: "co-2", role: "BUYER_BIDDER" }],
    });

    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.passwordResetCode.findFirst.mockResolvedValue({
      id: randomUUID(),
      userId: user.id,
      email: user.email,
      codeHash: makePasswordResetHash(user.email, "123456"),
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    mockPrisma.passwordResetCode.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mockPrisma.user.update.mockResolvedValue({ id: user.id });

    const res = await request.post("/api/auth/password-reset/confirm").send({
      email: user.email,
      code: "123456",
      password: "newpass123",
      confirmPassword: "newpass123",
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe("BUYER");
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);

    const updatePayload = mockPrisma.user.update.mock.calls[0]?.[0];
    const nextHash = updatePayload?.data?.passwordHash;
    expect(typeof nextHash).toBe("string");
    await expect(bcrypt.compare("newpass123", nextHash)).resolves.toBe(true);
  });

  it("rejects an invalid passcode and increments the attempt counter", async () => {
    const user = makeUser({
      email: "buyer@example.com",
      role: "BUYER",
      companyUsers: [{ companyId: "co-2", role: "BUYER_BIDDER" }],
    });

    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.passwordResetCode.findFirst.mockResolvedValue({
      id: randomUUID(),
      userId: user.id,
      email: user.email,
      codeHash: makePasswordResetHash(user.email, "123456"),
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    });
    mockPrisma.passwordResetCode.update.mockResolvedValue({ id: randomUUID() });

    const res = await request.post("/api/auth/password-reset/confirm").send({
      email: user.email,
      code: "654321",
      password: "newpass123",
      confirmPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_RESET_CODE");
    expect(mockPrisma.passwordResetCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptCount: 1,
        }),
      }),
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 with success true", async () => {
    const res = await request.post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("clears the token cookie", async () => {
    const res = await request.post("/api/auth/logout");
    const cookies = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"]
      : res.headers["set-cookie"]
        ? [res.headers["set-cookie"]]
        : [];

    const tokenCookie = cookies.find((cookie) => cookie.startsWith("token="));

    if (tokenCookie) {
      const isEmpty = tokenCookie.startsWith("token=;") || tokenCookie.includes("Max-Age=0");

      expect(isEmpty).toBe(true);
    }
  });

  it("works without any auth token", async () => {
    const res = await request.post("/api/auth/logout");

    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 200 with user data for valid token", async () => {
    const userId = randomUUID();
    const token = await makeValidToken({ userId, role: "SELLER", companyId: "co-1" });
    const dbUser = {
      id: userId,
      email: "seller@example.com",
      role: "SELLER",
      status: "ACTIVE",
      kycVerified: false,
      companyUsers: [
        {
          id: randomUUID(),
          companyId: "co-1",
          role: "SELLER_MANAGER",
          company: {
            id: "co-1",
            name: "Fleet Corp",
            registrationNumber: "AE-001",
            country: "UAE",
            status: "ACTIVE",
          },
        },
      ],
    };

    mockPrisma.user.findUnique.mockResolvedValue(dbUser);

    const res = await request
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.email).toBe("seller@example.com");
    expect(res.body.user.companyUsers).toHaveLength(1);
    expect(res.body.user.companyUsers[0].company.name).toBe("Fleet Corp");
  });

  it("returns 200 via cookie token", async () => {
    const userId = randomUUID();
    const token = await makeValidToken({ userId, role: "BUYER" });
    const dbUser = {
      id: userId,
      email: "buyer@example.com",
      role: "BUYER",
      status: "ACTIVE",
      kycVerified: true,
      companyUsers: [],
    };

    mockPrisma.user.findUnique.mockResolvedValue(dbUser);

    const res = await request
      .get("/api/auth/me")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("buyer@example.com");
  });

  it("returns 401 without any token", async () => {
    const res = await request.get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("returns 401 with expired token", async () => {
    const secret = new TextEncoder().encode(jwtSecret);
    const expiredToken = await new SignJWT({ role: "BUYER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(randomUUID())
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);

    const res = await request
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 when user no longer exists in DB", async () => {
    const token = await makeValidToken({ userId: randomUUID(), role: "BUYER" });

    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 with malformed token", async () => {
    const res = await request
      .get("/api/auth/me")
      .set("Authorization", "Bearer not.a.jwt");

    expect(res.status).toBe(401);
  });
});
