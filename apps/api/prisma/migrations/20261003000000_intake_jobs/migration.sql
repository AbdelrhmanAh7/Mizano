-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('WEB', 'TELEGRAM', 'EMAIL', 'IMPORT');

-- CreateEnum
CREATE TYPE "IntakeJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'EXTRACTED', 'NEEDS_REVIEW', 'FAILED', 'DEAD_LETTER', 'APPROVED');

-- CreateTable
CREATE TABLE "intake_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "source" "IntakeSource" NOT NULL DEFAULT 'WEB',
    "status" "IntakeJobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "result" JSONB,
    "forceType" TEXT,
    "strategy" TEXT,
    "draftDocumentType" TEXT,
    "draftDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "intake_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intake_jobs_organizationId_status_idx" ON "intake_jobs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "intake_jobs_organizationId_createdAt_idx" ON "intake_jobs"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "intake_jobs_organizationId_sha256_key" ON "intake_jobs"("organizationId", "sha256");

-- AddForeignKey
ALTER TABLE "intake_jobs" ADD CONSTRAINT "intake_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
