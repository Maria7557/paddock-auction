import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import prisma from "@/src/infrastructure/database/prisma";
import { verifyJwt } from "@/src/lib/auth";

export type SellerSession = {
  userId: string;
  companyId: string;
  companyName: string;
  companyStatus: string;
};

function loginRedirect(nextPath: string): never {
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function requireSellerSession(nextPath: string): Promise<SellerSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value?.trim();

  if (!token) {
    loginRedirect(nextPath);
  }

  const auth = await verifyJwt(token);

  if (!auth || auth.role !== "SELLER" || !auth.companyId) {
    loginRedirect(nextPath);
  }

  const company = await prisma.company.findUnique({
    where: { id: auth.companyId },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!company) {
    loginRedirect(nextPath);
  }

  return {
    userId: auth.userId,
    companyId: auth.companyId,
    companyName: company.name,
    companyStatus: company.status,
  };
}
