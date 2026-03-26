import prisma from "@/src/infrastructure/database/prisma";

export type PrismaClientLike = typeof prisma;
export type PrismaTransaction = Omit<
  PrismaClientLike,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction" | "$use"
>;
export type PrismaDecimal = NonNullable<
  Awaited<ReturnType<PrismaClientLike["depositLock"]["findFirst"]>>
>["amount"];

export { prisma };
export default prisma;
