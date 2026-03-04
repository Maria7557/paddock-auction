import { NextResponse } from "next/server";
import prisma from "@/src/infrastructure/database/prisma";

type HealthStatus = {
  status: "ok" | "error";
  database: "connected" | "disconnected";
  timestamp: string;
};

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw<{ result: number }[]>`SELECT 1 AS result`;

    const payload: HealthStatus = {
      status: "ok",
      database: "connected",
      timestamp,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch {
    const payload: HealthStatus = {
      status: "error",
      database: "disconnected",
      timestamp,
    };

    return NextResponse.json(payload, { status: 500 });
  }
}
