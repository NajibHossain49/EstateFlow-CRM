-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaEntityType" ADD VALUE 'CLIENT';
ALTER TYPE "MediaEntityType" ADD VALUE 'LEAD';
ALTER TYPE "MediaEntityType" ADD VALUE 'VISIT';

-- AlterTable
-- Add updatedAt with a temporary default so the migration is safe on non-empty
-- tables (backfills existing rows), then drop the default so the column matches
-- the Prisma `@updatedAt` (application-managed) definition — no schema drift.
ALTER TABLE "media" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "media" ALTER COLUMN "updatedAt" DROP DEFAULT;
