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

async function postWalletDeposit(request: Request): Promise<Response> {
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

  const wallet = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return null;
    }

    return tx.wallet.upsert({
      where: { userId },
      create: {
        userId,
        balance: amount,
      },
      update: {
        balance: {
          increment: amount,
        },
      },
    });
  });

  if (!wallet) {
    return NextResponse.json(
      {
        error_code: "WALLET_USER_NOT_FOUND",
        message: `User ${userId} was not found.`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ wallet: mapWalletDto(wallet) }, { status: 200 });
}

export const POST = withStructuredMutationLogging(async (request: Request) => {
  try {
    return await postWalletDeposit(request);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error_code: "WALLET_DEPOSIT_FAILED",
          message: "Wallet deposit failed due to a database constraint error.",
        },
        { status: 409 },
      );
    }

    throw error;
  }
});
