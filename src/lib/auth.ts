import { jwtVerify, SignJWT } from "jose";

const encoder = new TextEncoder();

export type AuthJwtPayload = {
  userId: string;
  role: string;
  companyId?: string;
  kycVerified?: boolean;
};

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    return null;
  }

  return encoder.encode(secret);
}

export async function signJwt(payload: AuthJwtPayload): Promise<string> {
  const secret = getJwtSecret();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
    kycVerified: payload.kycVerified ?? false,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyJwt(token: string): Promise<AuthJwtPayload | null> {
  try {
    const secret = getJwtSecret();

    if (!secret) {
      return null;
    }

    const verified = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    const userId = verified.payload.sub;
    const role = verified.payload.role;
    const companyId = verified.payload.companyId;
    const kycVerified = verified.payload.kycVerified;

    if (typeof userId !== "string" || typeof role !== "string") {
      return null;
    }

    return {
      userId,
      role,
      companyId: typeof companyId === "string" ? companyId : undefined,
      kycVerified: typeof kycVerified === "boolean" ? kycVerified : false,
    };
  } catch {
    return null;
  }
}
