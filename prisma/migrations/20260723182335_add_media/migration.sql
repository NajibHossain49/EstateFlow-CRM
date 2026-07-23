-- CreateEnum
CREATE TYPE "MediaEntityType" AS ENUM ('PROPERTY');

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "entityType" "MediaEntityType",
    "entityId" UUID,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_publicId_key" ON "media"("publicId");

-- CreateIndex
CREATE INDEX "media_entityType_entityId_idx" ON "media"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "media_createdBy_idx" ON "media"("createdBy");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
