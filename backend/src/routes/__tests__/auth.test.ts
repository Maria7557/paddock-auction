import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const compareMock = vi.fn();
const hashMock = vi.fn();
const mockPrisma = {
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
};

vi.mock("bcryptjs", () => ({
  default: {
    compare: compareMock,
    hash: hashMock,
  },
}));

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));

async function signToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
  email?: string;
}): Promise<string> {
  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function buildTestServer(): Promise<FastifyInstance> {
  const { authRoutes } = await import("../auth");
  const server = Fastify();

  await server.register(cookie);
  await server.register(authRoutes, {
    prefix: "/auth",
  });
  await server.ready();

  return server;
}

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-32-chars-long-enough!!";
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.resetModules();
});

describe("authRoutes", () => {
  it("returns 400 for invalid login payload", async () => {
    const server = await buildTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "not-an-email",
        password: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("INVALID_REQUEST");

    await server.close();
  });

  it("logs in a user, sets cookie, and returns user payload", async () => {
    const server = await buildTestServer();

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "seller@example.com",
      passwordHash: "stored-hash",
      role: "SELLER",
      companyUsers: [
        {
          companyId: "company-1",
          role: "SELLER_MANAGER",
        },
      ],
    });
    compareMock.mockResolvedValue(true);

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: " Seller@Example.com ",
        password: "password-123",
      },
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        email: "seller@example.com",
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
    expect(compareMock).toHaveBeenCalledWith("password-123", "stored-hash");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: "user-1",
        email: "seller@example.com",
        role: "SELLER",
      },
    });

    const setCookieHeader = response.headers["set-cookie"];

    expect(setCookieHeader).toContain("token=");
    expect(setCookieHeader).toContain("HttpOnly");

    await server.close();
  });

  it("returns 401 when login credentials are invalid", async () => {
    const server = await buildTestServer();

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "buyer@example.com",
      passwordHash: "stored-hash",
      role: "BUYER",
      companyUsers: [],
    });
    compareMock.mockResolvedValue(false);

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "buyer@example.com",
        password: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Unauthorized",
    });

    await server.close();
  });

  it("registers a user, company, and company user in a transaction", async () => {
    const server = await buildTestServer();

    hashMock.mockResolvedValue("hashed-password");
    mockPrisma.user.create.mockResolvedValue({
      id: "generated-user-id",
      email: "buyer@example.com",
      role: "BUYER",
    });
    mockPrisma.company.create.mockResolvedValue({
      id: "generated-company-id",
    });
    mockPrisma.companyUser.create.mockResolvedValue({
      id: "generated-company-user-id",
    });
    mockPrisma.$transaction.mockResolvedValue([
      {
        id: "generated-user-id",
        email: "buyer@example.com",
        role: "BUYER",
      },
      {
        id: "generated-company-id",
      },
      {
        id: "generated-company-user-id",
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "Buyer@Example.com",
        password: "password-123",
        role: "BUYER",
        companyName: "Buyer Co",
        registrationNumber: "BUY-123",
        country: "AE",
      },
    });

    expect(hashMock).toHaveBeenCalledWith("password-123", 12);
    expect(mockPrisma.user.create).toHaveBeenCalledOnce();
    expect(mockPrisma.company.create).toHaveBeenCalledOnce();
    expect(mockPrisma.companyUser.create).toHaveBeenCalledOnce();
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      user: {
        id: "generated-user-id",
        email: "buyer@example.com",
        role: "BUYER",
      },
    });

    await server.close();
  });

  it("clears the auth cookie on logout", async () => {
    const server = await buildTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/auth/logout",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
    });
    expect(response.headers["set-cookie"]).toContain("token=;");

    await server.close();
  });

  it("returns current user from /me", async () => {
    const server = await buildTestServer();
    const token = await signToken({
      userId: "user-42",
      role: "SELLER",
      companyId: "company-42",
      email: "seller@example.com",
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-42",
      email: "seller@example.com",
      passwordHash: "secret-hash",
      role: "SELLER",
      status: "ACTIVE",
      kycVerified: true,
      companyUsers: [
        {
          id: "company-user-1",
          companyId: "company-42",
          role: "SELLER_MANAGER",
          company: {
            id: "company-42",
            name: "Seller Co",
            registrationNumber: "SELL-42",
            country: "AE",
            status: "ACTIVE",
          },
        },
      ],
    });

    const response = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: "user-42",
        email: "seller@example.com",
        role: "SELLER",
        status: "ACTIVE",
        kycVerified: true,
        companyUsers: [
          {
            id: "company-user-1",
            companyId: "company-42",
            role: "SELLER_MANAGER",
            company: {
              id: "company-42",
              name: "Seller Co",
              registrationNumber: "SELL-42",
              country: "AE",
              status: "ACTIVE",
            },
          },
        ],
      },
    });

    await server.close();
  });

  it("returns 401 from /me without auth token", async () => {
    const server = await buildTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/auth/me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Unauthorized",
    });

    await server.close();
  });
});
