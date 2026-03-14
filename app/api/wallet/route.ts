import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";
import { mapWalletDto, resolveWalletUserId } from "@/src/modules/wallet/transport/wallet_http";

export async function GET(request: Request): Promise<Response> {
  const userId = resolveWalletUserId(request);

  if (!userId) {
    return NextResponse.json(
      {
        error_code: "WALLET_USER_ID_REQUIRED",
        message: "Provide user id using x-user-id header, user-id header, or user_id query param.",
      },
      { status: 400 },
    );
  }

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
      update: {},
      create: { userId },
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
