import { createHmac, timingSafeEqual } from "node:crypto";

type ParsedStripeSignature = {
  timestamp: number;
  v1: string[];
};

function parseStripeSignatureHeader(signatureHeader: string | null | undefined): ParsedStripeSignature | null {
  if (!signatureHeader) {
    return null;
  }

  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  let timestamp: number | null = null;
  const v1: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=", 2);

    if (!key || !value) {
      continue;
    }

    if (key === "t") {
      const parsedTimestamp = Number(value);

      if (Number.isInteger(parsedTimestamp) && parsedTimestamp > 0) {
        timestamp = parsedTimestamp;
      }
    }

    if (key === "v1") {
      v1.push(value);
    }
  }

  if (timestamp === null || v1.length === 0) {
    return null;
  }

  return {
    timestamp,
    v1,
  };
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function computeStripeSignatureV1(
  payload: string,
  timestamp: number,
  webhookSigningSecret: string,
): string {
  return createHmac("sha256", webhookSigningSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}

export function createStripeSignatureHeader(
  payload: string,
  webhookSigningSecret: string,
  timestamp: number,
): string {
  const signature = computeStripeSignatureV1(payload, timestamp, webhookSigningSecret);
  return `t=${timestamp},v1=${signature}`;
}

export function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null | undefined,
  webhookSigningSecret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  if (!webhookSigningSecret || webhookSigningSecret.trim().length === 0) {
    return false;
  }

  const parsed = parseStripeSignatureHeader(signatureHeader);

  if (parsed === null) {
    return false;
  }

  const ageSeconds = Math.abs(nowSeconds - parsed.timestamp);

  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const expectedSignature = computeStripeSignatureV1(payload, parsed.timestamp, webhookSigningSecret);

  return parsed.v1.some((candidate) => secureEquals(candidate, expectedSignature));
}
