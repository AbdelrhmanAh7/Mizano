-- A retried "record payment" request (double click, network retry) carries the same key and must
-- not settle invoices or bills twice: one payment per organization and key.
ALTER TABLE "payments_received" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "payments_made" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "payments_received_organizationId_idempotencyKey_key" ON "payments_received"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "payments_made_organizationId_idempotencyKey_key" ON "payments_made"("organizationId", "idempotencyKey");
