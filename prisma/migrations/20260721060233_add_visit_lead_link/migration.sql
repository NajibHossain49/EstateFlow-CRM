-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "leadId" UUID;

-- CreateIndex
CREATE INDEX "visits_leadId_idx" ON "visits"("leadId");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
