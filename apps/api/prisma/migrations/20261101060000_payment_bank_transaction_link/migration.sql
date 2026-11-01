-- A payment already in the books is reconciled by linking it to its bank statement line (#635):
-- nothing is posted again, and a payment can be linked to one line only.
ALTER TABLE "payments_received" ADD COLUMN "bankTransactionId" TEXT;
ALTER TABLE "payments_made" ADD COLUMN "bankTransactionId" TEXT;

CREATE UNIQUE INDEX "payments_received_bankTransactionId_key" ON "payments_received"("bankTransactionId");
CREATE UNIQUE INDEX "payments_made_bankTransactionId_key" ON "payments_made"("bankTransactionId");
