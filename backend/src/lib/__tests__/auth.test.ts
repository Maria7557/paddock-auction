import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  requireAdminAuth,
  requireAuth,
  requireSellerAuth,
  verifyToken,
  type AuthTokenPayload,
} from "../auth";

const SECRET = "test-secret-32-chars-long-enough!!";

async function signToken(payload: Record<string, unknown>, secret = SECRET): Promise<string> {
  const encoder = new TextEncoder();

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId as string)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encoder.encode(secret));
}

function makeMockReply() {
  const reply = {
    _code: 200,
    _body: null as unknown,
    sent: false,
    code(n: number) {
      this._code = n;
      return this;
    },
    async send(body: unknown) {
      this._body = body;
      this.sent = true;
      return this;
    },
  };

  return reply;
}

function makeMockRequest(
  overrides: Partial<{
    headers: Record<string, string>;
    cookies: Record<string, string>;
  }> = {},
) {
  return {
    headers: overrides.headers ?? {},
    cookies: overrides.cookies ?? {},
    auth: undefined as AuthTokenPayload | undefined,
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

describe("verifyToken", () => {
  it("verifies a valid BUYER token and returns payload", async () => {
    const token = await signToken({ userId: "user-1", role: "BUYER" });
    const payload = await verifyToken(token);

    expect(payload.userId).toBe("user-1");
    expect(payload.role).toBe("BUYER");
    expect(payload.sub).toBe("user-1");
  });

  it("returns companyId when present in token", async () => {
    const token = await signToken({ userId: "user-2", role: "SELLER", companyId: "co-1" });
    const payload = await verifyToken(token);

    expect(payload.companyId).toBe("co-1");
  });

  it("returns kycVerified=false when not in token", async () => {
    const token = await signToken({ userId: "user-3", role: "BUYER" });
    const payload = await verifyToken(token);

    expect(payload.kycVerified).toBe(false);
  });

  it("returns kycVerified=true when set in token", async () => {
    const token = await signToken({ userId: "user-4", role: "BUYER", kycVerified: true });
    const payload = await verifyToken(token);

    expect(payload.kycVerified).toBe(true);
  });

  it("throws on tampered token", async () => {
    const token = await signToken({ userId: "user-5", role: "BUYER" });
    const tampered = token.slice(0, -5) + "XXXXX";

    await expect(verifyToken(tampered)).rejects.toThrow();
  });

  it("throws on token signed with wrong secret", async () => {
    const token = await signToken({ userId: "user-6", role: "BUYER" }, "wrong-secret-!!");

    await expect(verifyToken(token)).rejects.toThrow();
  });

  it("throws when JWT_SECRET is not set", async () => {
    const original = process.env.JWT_SECRET;

    delete process.env.JWT_SECRET;

    const token = await signToken({ userId: "user-7", role: "BUYER" }, original!);

    await expect(verifyToken(token)).rejects.toThrow("JWT_SECRET is not configured");

    process.env.JWT_SECRET = original;
  });
});

describe("requireAuth", () => {
  it("sets request.auth from Authorization Bearer header", async () => {
    const token = await signToken({ userId: "user-10", role: "BUYER" });
    const req = makeMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const reply = makeMockReply();

    await requireAuth(req as never, reply as never);

    expect(reply.sent).toBe(false);
    expect(req.auth?.userId).toBe("user-10");
  });

  it("sets request.auth from cookie token", async () => {
    const token = await signToken({ userId: "user-11", role: "SELLER", companyId: "co-2" });
    const req = makeMockRequest({ cookies: { token } });
    const reply = makeMockReply();

    await requireAuth(req as never, reply as never);

    expect(reply.sent).toBe(false);
    expect(req.auth?.userId).toBe("user-11");
  });

  it("sets request.auth from raw Cookie header", async () => {
    const token = await signToken({ userId: "user-12", role: "ADMIN" });
    const req = makeMockRequest({ headers: { cookie: `token=${token}; other=val` } });
    const reply = makeMockReply();

    await requireAuth(req as never, reply as never);

    expect(reply.sent).toBe(false);
    expect(req.auth?.role).toBe("ADMIN");
  });

  it("returns 401 when no token provided", async () => {
    const req = makeMockRequest();
    const reply = makeMockReply();

    await requireAuth(req as never, reply as never);

    expect(reply.sent).toBe(true);
    expect(reply._code).toBe(401);
    expect((reply._body as { error: string }).error).toBe("Unauthorized");
  });

  it("returns 401 for invalid token", async () => {
    const req = makeMockRequest({ headers: { authorization: "Bearer invalid.jwt.token" } });
    const reply = makeMockReply();

    await requireAuth(req as never, reply as never);

    expect(reply.sent).toBe(true);
    expect(reply._code).toBe(401);
  });

  it("Bearer takes priority over cookie", async () => {
    const tokenBearer = await signToken({ userId: "user-bearer", role: "BUYER" });
    const tokenCookie = await signToken({ userId: "user-cookie", role: "SELLER" });
    const req = makeMockRequest({
      headers: { authorization: `Bearer ${tokenBearer}` },
      cookies: { token: tokenCookie },
    });
    const reply = makeMockReply();

    await requireAuth(req as never, reply as never);

    expect(req.auth?.userId).toBe("user-bearer");
  });
});

describe("requireAdminAuth", () => {
  it("allows ADMIN role", async () => {
    const token = await signToken({ userId: "admin-1", role: "ADMIN" });
    const req = makeMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const reply = makeMockReply();

    await requireAdminAuth(req as never, reply as never);

    expect(reply.sent).toBe(false);
    expect(req.auth?.role).toBe("ADMIN");
  });

  it("rejects BUYER role with 401", async () => {
    const token = await signToken({ userId: "buyer-1", role: "BUYER" });
    const req = makeMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const reply = makeMockReply();

    await requireAdminAuth(req as never, reply as never);

    expect(reply.sent).toBe(true);
    expect(reply._code).toBe(401);
  });

  it("rejects SELLER role with 401", async () => {
    const token = await signToken({ userId: "seller-1", role: "SELLER", companyId: "co-1" });
    const req = makeMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const reply = makeMockReply();

    await requireAdminAuth(req as never, reply as never);

    expect(reply.sent).toBe(true);
    expect(reply._code).toBe(401);
  });
});

describe("requireSellerAuth", () => {
  it("allows SELLER with companyId", async () => {
    const token = await signToken({ userId: "seller-2", role: "SELLER", companyId: "co-3" });
    const req = makeMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const reply = makeMockReply();

    await requireSellerAuth(req as never, reply as never);

    expect(reply.sent).toBe(false);
    expect(req.auth?.companyId).toBe("co-3");
  });

  it("rejects SELLER without companyId", async () => {
    const token = await signToken({ userId: "seller-3", role: "SELLER" });
    const req = makeMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const reply = makeMockReply();

    await requireSellerAuth(req as never, reply as never);

    expect(reply.sent).toBe(true);
    expect(reply._code).toBe(401);
  });

  it("rejects ADMIN role", async () => {
    const token = await signToken({ userId: "admin-2", role: "ADMIN" });
    const req = makeMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const reply = makeMockReply();

    await requireSellerAuth(req as never, reply as never);

    expect(reply.sent).toBe(true);
    expect(reply._code).toBe(401);
  });
});
