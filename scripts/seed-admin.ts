import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const ADMIN_EMAIL = "admin@fleetbid.ae";
const ADMIN_PASSWORD = "Admin1234!";
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const existingAdmin = await prisma.user.findUnique({
    where: {
      email: ADMIN_EMAIL,
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  if (existingAdmin) {
    console.log(
      JSON.stringify(
        {
          action: "ADMIN_ALREADY_EXISTS",
          userId: existingAdmin.id,
          email: existingAdmin.email,
          role: existingAdmin.role,
          status: existingAdmin.status,
        },
        null,
        2,
      ),
    );
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const createdAdmin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        action: "ADMIN_CREATED",
        userId: createdAdmin.id,
        email: createdAdmin.email,
        role: createdAdmin.role,
        status: createdAdmin.status,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
