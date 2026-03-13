const { PrismaClient } = require("../../node_modules/@prisma/client") as typeof import("../../node_modules/@prisma/client");
type PrismaClientOptions = NonNullable<ConstructorParameters<typeof PrismaClient>[0]>;

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: InstanceType<typeof PrismaClient>;
};

const prismaLogLevels: PrismaClientOptions["log"] =
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
