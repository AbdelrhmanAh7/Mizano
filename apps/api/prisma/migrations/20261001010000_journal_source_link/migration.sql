-- Link each system-generated journal to the business event that produced it.
-- NULLs are distinct in PostgreSQL, so manual journals (no source) are unaffected.
ALTER TABLE "journals" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "journals" ADD COLUMN "sourceId" TEXT;
CREATE UNIQUE INDEX "journals_organizationId_sourceType_sourceId_key" ON "journals"("organizationId", "sourceType", "sourceId");
