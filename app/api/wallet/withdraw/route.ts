import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import {
  formatValidationIssues,
  mapWalletDto,
  normalizeMoneyDecimal,
  resolveWalletUserId,
  walletMutationPayloadSchema,
} from "@/src/modules/wallet/transport/wallet_http";

type WalletRow = {
  id: string;
  userId: string;
  balance: Prisma.Decimal | string | number;
  lockedBalance: Prisma.Decimal | string | number;
};

type WithdrawResult =
  | {
      kind: "ok";
      wallet: WalletRow;
    }
  | {
      kind: "user_not_found";
      userId: string;
    }
  | {
      kind: "wallet_not_found";
      userId: string;
    }
  | {
      kind: "insufficient_funds";
      wallet: WalletRow;
    };

async function postWalletWithdraw(request: Request): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error_code: "WALLET_INVALID_PAYLOAD",
        message: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const parsedPayload = walletMutationPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      {
        error_code: "WALLET_INVALID_PAYLOAD",
        message: formatValidationIssues(parsedPayload.error.issues),
      },
      { status: 400 },
    );
  }

  const userId = resolveWalletUserId(request, parsedPayload.data);

  if (!userId) {
    return NextResponse.json(
      {
        error_code: "WALLET_USER_ID_REQUIRED",
        message: "Provide user id using x-user-id header, user-id header, user_id query param, or request body.",
      },
      { status: 400 },
    );
  }

  const amount = normalizeMoneyDecimal(parsedPayload.data.amount);

  const withdrawResult = await prisma.$transaction(async (tx): Promise<WithdrawResult> => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return {
        kind: "user_not_found",
        userId,
      };
    }

    const updatedWallets = await tx.$queryRaw<WalletRow[]>`
      UPDATE "Wallet"
      SET "balance" = "balance" - ${amount},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
        AND ("balance" - "lockedBalance") >= ${amount}
      RETURNING "id", "userId", "balance", "lockedBalance"
    `;

    if (updatedWallets.length > 0) {
      return {
        kind: "ok",
        wallet: updatedWallets[0],
      };
    }

    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        balance: true,
        lockedBalance: true,
      },
    });

    if (!wallet) {
      return {
        kind: "wallet_not_found",
        userId,
      };
    }

    return {
      kind: "insufficient_funds",
      wallet,
    };
  });

  if (withdrawResult.kind === "user_not_found") {
    return NextResponse.json(
      {
        error_code: "WALLET_USER_NOT_FOUND",
        message: `User ${withdrawResult.userId} was not found.`,
      },
      { status: 404 },
    );
  }

  if (withdrawResult.kind === "wallet_not_found") {
    return NextResponse.json(
      {
        error_code: "WALLET_NOT_FOUND",
        message: `Wallet for user ${withdrawResult.userId} was not found.`,
      },
      { status: 404 },
    );
  }

  if (withdrawResult.kind === "insufficient_funds") {
    return NextResponse.json(
      {
        error_code: "WALLET_INSUFFICIENT_AVAILABLE_BALANCE",
        message: "Insufficient available balance.",
        wallet: mapWalletDto(withdrawResult.wallet),
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ wallet: mapWalletDto(withdrawResult.wallet) }, { status: 200 });
}

export const POST = withStructuredMutationLogging(async (request: Request) => {
  try {
    return await postWalletWithdraw(request);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error_code: "WALLET_WITHDRAW_FAILED",
          message: "Wallet withdraw failed due to a database constraint error.",
        },
        { status: 409 },
      );
    }

    throw error;
  }
});
