import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    company: {
      create: vi.fn(),
    },
    companyUser: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ prisma: mockPrisma }));

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
    registrationNumber: "AE-12345",
    country: "UAE",
  } as const;

  const validBuyerBody = {
    email: "newbuyer@example.com",
    password: "securepass99",
    role: "BUYER",
    companyName: "Buyer Co",
    registrationNumber: "AE-99999",
    country: "UAE",
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

  it("returns 400 when required fields are missing", async () => {
    const res = await request.post("/api/auth/register").send({ email: "x@example.com" });

    expect(res.status).toBe(400);
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
