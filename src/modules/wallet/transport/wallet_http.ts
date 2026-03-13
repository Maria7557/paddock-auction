import { z } from "zod";

type WalletValue =
  | number
  | string
  | {
      toString(): string;
    };

type WalletLike = {
  id: string;
  userId: string;
  balance: WalletValue;
  lockedBalance: WalletValue;
};

export type WalletDto = {
  id: string;
  userId: string;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
};

export const walletMutationPayloadSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  user_id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
});

export type WalletMutationPayload = z.infer<typeof walletMutationPayloadSchema>;

function cleanOptionalValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveWalletUserId(request: Request, payload?: Partial<WalletMutationPayload>): string | null {
  const url = new URL(request.url);

  return (
    cleanOptionalValue(url.searchParams.get("user_id")) ??
    cleanOptionalValue(url.searchParams.get("userId")) ??
    cleanOptionalValue(request.headers.get("x-user-id")) ??
    cleanOptionalValue(request.headers.get("user-id")) ??
    cleanOptionalValue(payload?.user_id) ??
    cleanOptionalValue(payload?.userId) ??
    null
  );
}

function toMoneyNumber(value: WalletValue): number {
  if (typeof value === "string") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(value.toString());
}

function normalizeMoneyNumber(amount: number): number {
  return Number(amount.toFixed(2));
}

export function normalizeMoneyDecimal(amount: number): number {
  return normalizeMoneyNumber(amount);
}

export function formatValidationIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => issue.message).join("; ");
}

export function mapWalletDto(wallet: WalletLike): WalletDto {
  const balance = normalizeMoneyNumber(toMoneyNumber(wallet.balance));
  const lockedBalance = normalizeMoneyNumber(toMoneyNumber(wallet.lockedBalance));

  return {
    id: wallet.id,
    userId: wallet.userId,
    balance,
    lockedBalance,
    availableBalance: normalizeMoneyNumber(balance - lockedBalance),
  };
}
