import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), quiet: true });

if (!process.env.DATABASE_URL) {
  config({ path: resolve(process.cwd(), "..", ".env"), quiet: true });
}

type GlobalForPrisma = typeof globalThis & {
  prisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalForPrisma;

type PrismaLogLevel = "query" | "error" | "warn";

const prismaLogLevels: PrismaLogLevel[] =
  process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogLevels,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
