-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Remove temporary default after backfilling existing rows.
ALTER TABLE "User"
ALTER COLUMN "passwordHash" DROP DEFAULT;

-- Rebuild role enum using Identity naming contract.
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN', 'SUPER_ADMIN');

ALTER TABLE "User"
ALTER COLUMN "role" DROP DEFAULT,
ALTER COLUMN "role" TYPE "UserRole"
USING (
  CASE
    WHEN "role"::text = 'USER' THEN 'BUYER'
    ELSE "role"::text
  END
)::"UserRole";

DROP TYPE "Role";

ALTER TABLE "User"
ALTER COLUMN "role" SET DEFAULT 'BUYER';
