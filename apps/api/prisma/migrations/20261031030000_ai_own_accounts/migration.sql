-- AI through the organization's own account (owner decision, 31 Oct 2026): per-organization
-- settings with a sealed provider key, a usage log for the monthly limit, and single-use
-- OpenRouter PKCE states. Additive only: the retired AI tables and organizations.ai*Enabled
-- flags stay until a later cleanup.

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'none',
    "model" TEXT,
    "keyCiphertext" TEXT,
    "keyHint" TEXT,
    "keySource" TEXT,
    "priceInPerMtok" DECIMAL(12,6),
    "priceOutPerMtok" DECIMAL(12,6),
    "monthlyLimitUsd" DECIMAL(12,4) NOT NULL DEFAULT 5,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentAt" TIMESTAMP(3),
    "consentById" TEXT,
    "consentProvider" TEXT,
    "connectedAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6) NOT NULL,
    "costUsd" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_oauth_states" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "verifierCiphertext" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_settings_organizationId_key" ON "ai_settings"("organizationId");

-- CreateIndex
CREATE INDEX "ai_settings_provider_idx" ON "ai_settings"("provider");

-- CreateIndex
CREATE INDEX "ai_usage_organizationId_createdAt_idx" ON "ai_usage"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_oauth_states_stateHash_key" ON "ai_oauth_states"("stateHash");

-- CreateIndex
CREATE INDEX "ai_oauth_states_organizationId_userId_idx" ON "ai_oauth_states"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_oauth_states" ADD CONSTRAINT "ai_oauth_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

