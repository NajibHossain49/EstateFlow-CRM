-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "updatedById" UUID;

-- CreateIndex
CREATE INDEX "activities_deletedAt_idx" ON "activities"("deletedAt");

-- CreateIndex
CREATE INDEX "clients_deletedAt_idx" ON "clients"("deletedAt");

-- CreateIndex
CREATE INDEX "leads_deletedAt_idx" ON "leads"("deletedAt");

-- CreateIndex
CREATE INDEX "media_deletedAt_idx" ON "media"("deletedAt");

-- CreateIndex
CREATE INDEX "properties_deletedAt_idx" ON "properties"("deletedAt");

-- CreateIndex
CREATE INDEX "visits_deletedAt_idx" ON "visits"("deletedAt");
