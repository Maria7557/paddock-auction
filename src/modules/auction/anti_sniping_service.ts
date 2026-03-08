import type { SqlClient, SqlRow } from "../../lib/sql_contract";

export const ANTI_SNIPING_EXTENSION_SECONDS = 120;

export type AntiSnipingInput = {
  auctionId: string;
  currentEndsAt: Date;
  occurredAt: Date;
  extensionSeconds?: number;
};

export type AntiSnipingResult = {
  extended: boolean;
  previousEndsAt: Date;
  endsAt: Date;
  extensionSeconds: number;
  remainingMs: number;
};

type AuctionEndsAtRow = SqlRow & {
  ends_at: unknown;
};

function parseDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw new Error(`Field ${fieldName} must be a valid date. Received: ${String(value)}`);
}

function resolveExtensionSeconds(extensionSeconds: number | undefined): number {
  if (extensionSeconds === undefined) {
    return ANTI_SNIPING_EXTENSION_SECONDS;
  }

  if (!Number.isInteger(extensionSeconds) || extensionSeconds <= 0) {
    return ANTI_SNIPING_EXTENSION_SECONDS;
  }

  return extensionSeconds;
}

export function shouldExtendAuctionForBid(
  currentEndsAt: Date,
  occurredAt: Date,
  extensionSeconds = ANTI_SNIPING_EXTENSION_SECONDS,
): boolean {
  const remainingMs = currentEndsAt.getTime() - occurredAt.getTime();
  return remainingMs < resolveExtensionSeconds(extensionSeconds) * 1000;
}

export async function applyAntiSnipingExtension(
  tx: SqlClient,
  input: AntiSnipingInput,
): Promise<AntiSnipingResult> {
  const extensionSeconds = resolveExtensionSeconds(input.extensionSeconds);
  const remainingMs = input.currentEndsAt.getTime() - input.occurredAt.getTime();

  if (!shouldExtendAuctionForBid(input.currentEndsAt, input.occurredAt, extensionSeconds)) {
    return {
      extended: false,
      previousEndsAt: input.currentEndsAt,
      endsAt: input.currentEndsAt,
      extensionSeconds,
      remainingMs,
    };
  }

  const updateResult = await tx.query<AuctionEndsAtRow>(
    `UPDATE auctions
     SET ends_at = ends_at + ($2 * INTERVAL '1 second'),
         extension_count = extension_count + 1,
         updated_at = $3::timestamptz
     WHERE id = $1
     RETURNING ends_at`,
    [input.auctionId, extensionSeconds, input.occurredAt.toISOString()],
  );

  if (updateResult.rows.length === 0) {
    throw new Error(`Auction ${input.auctionId} was not found while applying anti-sniping extension`);
  }

  return {
    extended: true,
    previousEndsAt: input.currentEndsAt,
    endsAt: parseDate(updateResult.rows[0].ends_at, "auctions.ends_at"),
    extensionSeconds,
    remainingMs,
  };
}
