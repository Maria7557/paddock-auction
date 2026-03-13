import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyJwt } from "@/src/lib/auth";
import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

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

  const response = await api.auth.me<{
    user?: {
      companyUsers?: Array<{
        companyId?: string;
        company?: {
          name?: string;
          status?: string;
        } | null;
      }>;
    };
  }>(await withServerCookies({ cache: "no-store" })).catch(() => null);

  const company = response?.user?.companyUsers?.find((companyUser) => companyUser.companyId === auth.companyId)?.company;
  const companyName = company?.name?.trim();
  const companyStatus = company?.status?.trim();

  if (!companyName || !companyStatus) {
    loginRedirect(nextPath);
  }

  return {
    userId: auth.userId,
    companyId: auth.companyId,
    companyName,
    companyStatus,
  };
}
