CREATE TABLE "telegram_deliveries" (
    "botKey" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "senderId" BIGINT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "intakeJobId" TEXT,
    "deferredUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_deliveries_pkey" PRIMARY KEY ("botKey", "updateId")
);
CREATE INDEX "telegram_deliveries_organizationId_createdAt_idx"
ON "telegram_deliveries"("organizationId", "createdAt");
CREATE INDEX "telegram_deliveries_botKey_completedAt_deferredUntil_idx"
ON "telegram_deliveries"("botKey", "completedAt", "deferredUntil");
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
