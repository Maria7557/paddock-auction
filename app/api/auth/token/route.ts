import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value ?? null;

  return NextResponse.json(
    { token },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
