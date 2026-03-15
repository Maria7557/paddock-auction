import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import prisma from "@/src/infrastructure/database/prisma";
import { verifyJwt } from "@/src/lib/auth";

export type BuyerSession = {
  userId: string;
  companyId: string | null;
};

function loginRedirect(nextPath: string): never {
  redirect(`/login/buyer?next=${encodeURIComponent(nextPath)}`);
}

export async function requireBuyerSession(nextPath: string): Promise<BuyerSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value?.trim();

  if (!token) {
    loginRedirect(nextPath);
  }

  const auth = await verifyJwt(token);

  if (!auth || auth.role !== "BUYER") {
    loginRedirect(nextPath);
  }

  if (!auth.companyId) {
    return {
      userId: auth.userId,
      companyId: null,
    };
  }

  const company = await prisma.company.findUnique({
    where: { id: auth.companyId },
    select: { id: true },
  });

  return {
    userId: auth.userId,
    companyId: company ? auth.companyId : null,
  };
}
