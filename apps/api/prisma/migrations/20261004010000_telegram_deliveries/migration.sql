CREATE TABLE "telegram_deliveries" (
    "botKey" TEXT NOT NULL,
    "updateId" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "intakeJobId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_deliveries_pkey" PRIMARY KEY ("botKey", "updateId")
);
CREATE INDEX "telegram_deliveries_organizationId_createdAt_idx"
ON "telegram_deliveries"("organizationId", "createdAt");
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
