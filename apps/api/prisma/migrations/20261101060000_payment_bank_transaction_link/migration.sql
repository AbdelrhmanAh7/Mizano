-- A payment already in the books is reconciled by linking it to its bank statement line (#635):
-- nothing is posted again, and a payment can be linked to one line only.
ALTER TABLE "payments_received" ADD COLUMN "bankTransactionId" TEXT;
ALTER TABLE "payments_made" ADD COLUMN "bankTransactionId" TEXT;

CREATE UNIQUE INDEX "payments_received_bankTransactionId_key" ON "payments_received"("bankTransactionId");
CREATE UNIQUE INDEX "payments_made_bankTransactionId_key" ON "payments_made"("bankTransactionId");

-- Bank lines reconciled before this release settled an open invoice or bill by recording a new
-- payment; which payment it was is not stored. Every live payment that could be one (the line's
-- document, absolute amount, day, reference and bank ledger account, by bank transfer, allocated in
-- full) gets 'unresolved:<payment id>' instead of a line id, so suggestions and confirmation (which
-- only take payments with no link) never offer it to another line. Nothing is guessed: such a
-- payment is left out of matching, the safe side. Voiding clears it as usual.
UPDATE "payments_received" p SET "bankTransactionId" = 'unresolved:' || p.id
FROM "bank_transactions" bt
JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
JOIN "payment_allocations" a ON a."invoiceId" = bt."matchedEntityId"
WHERE a."paymentId" = p.id AND a.amount = p.amount
  AND bt.status = 'MATCHED' AND bt."matchedEntityType" = 'invoice' AND bt.type = 'DEPOSIT'
  AND p."organizationId" = bt."organizationId" AND p."deletedAt" IS NULL
  AND p."bankTransactionId" IS NULL AND p."paymentMode" = 'BANK_TRANSFER'
  AND p.amount = abs(bt.amount) AND p.date::date = bt.date::date
  AND p.reference IS NOT DISTINCT FROM bt.reference AND p."depositToAccountId" = ba."linkedAccountId";

UPDATE "payments_made" p SET "bankTransactionId" = 'unresolved:' || p.id
FROM "bank_transactions" bt
JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
JOIN "bill_allocations" a ON a."billId" = bt."matchedEntityId"
WHERE a."paymentId" = p.id AND a.amount = p.amount
  AND bt.status = 'MATCHED' AND bt."matchedEntityType" = 'bill' AND bt.type = 'WITHDRAWAL'
  AND p."organizationId" = bt."organizationId" AND p."deletedAt" IS NULL
  AND p."bankTransactionId" IS NULL AND p."paymentMode" = 'BANK_TRANSFER'
  AND p.amount = abs(bt.amount) AND p.date::date = bt.date::date
  AND p.reference IS NOT DISTINCT FROM bt.reference AND p."paidFromAccountId" = ba."linkedAccountId";
