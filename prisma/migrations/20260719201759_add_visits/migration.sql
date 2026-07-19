-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visits_clientId_idx" ON "visits"("clientId");

-- CreateIndex
CREATE INDEX "visits_propertyId_idx" ON "visits"("propertyId");

-- CreateIndex
CREATE INDEX "visits_agentId_idx" ON "visits"("agentId");

-- CreateIndex
CREATE INDEX "visits_status_idx" ON "visits"("status");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
