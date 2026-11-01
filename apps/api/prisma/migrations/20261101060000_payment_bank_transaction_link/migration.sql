-- A payment already in the books is reconciled by linking it to its bank statement line (#635):
-- nothing is posted again, and a payment can be linked to one line only.
ALTER TABLE "payments_received" ADD COLUMN "bankTransactionId" TEXT;
ALTER TABLE "payments_made" ADD COLUMN "bankTransactionId" TEXT;

CREATE UNIQUE INDEX "payments_received_bankTransactionId_key" ON "payments_received"("bankTransactionId");
CREATE UNIQUE INDEX "payments_made_bankTransactionId_key" ON "payments_made"("bankTransactionId");

-- Bank lines reconciled before this release settled an open invoice or bill by recording a new
-- payment for exactly that line, in the same database transaction that marked the line MATCHED.
-- Link those payments now so they are never offered for another line. The evidence: the same
-- document, the line's absolute amount, its day and reference, the bank's ledger account, a bank
-- transfer allocated in full, AND created within a minute of the line being marked matched (a
-- payment recorded by hand earlier or later fails this). Only one-to-one candidates are linked;
-- an ambiguous pair (two identical lines matched within the same minute) is left unlinked.
WITH cand AS (
  SELECT bt.id AS line_id, p.id AS pay_id
  FROM "bank_transactions" bt
  JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
  JOIN "payment_allocations" a ON a."invoiceId" = bt."matchedEntityId"
  JOIN "payments_received" p ON p.id = a."paymentId" AND a.amount = p.amount
  WHERE bt.status = 'MATCHED' AND bt."matchedEntityType" = 'invoice' AND bt.type = 'DEPOSIT'
    AND p."organizationId" = bt."organizationId" AND p."deletedAt" IS NULL
    AND p."bankTransactionId" IS NULL AND p."paymentMode" = 'BANK_TRANSFER'
    AND p.amount = abs(bt.amount) AND p.date::date = bt.date::date
    AND p.reference IS NOT DISTINCT FROM bt.reference AND p."depositToAccountId" = ba."linkedAccountId"
    AND abs(extract(epoch FROM (p."createdAt" - bt."updatedAt"))) <= 60
),
uniq AS (
  SELECT c.line_id, c.pay_id FROM cand c
  WHERE (SELECT count(*) FROM cand x WHERE x.line_id = c.line_id) = 1
    AND (SELECT count(*) FROM cand y WHERE y.pay_id = c.pay_id) = 1
)
UPDATE "payments_received" p SET "bankTransactionId" = uniq.line_id FROM uniq WHERE p.id = uniq.pay_id;

WITH cand AS (
  SELECT bt.id AS line_id, p.id AS pay_id
  FROM "bank_transactions" bt
  JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
  JOIN "bill_allocations" a ON a."billId" = bt."matchedEntityId"
  JOIN "payments_made" p ON p.id = a."paymentId" AND a.amount = p.amount
  WHERE bt.status = 'MATCHED' AND bt."matchedEntityType" = 'bill' AND bt.type = 'WITHDRAWAL'
    AND p."organizationId" = bt."organizationId" AND p."deletedAt" IS NULL
    AND p."bankTransactionId" IS NULL AND p."paymentMode" = 'BANK_TRANSFER'
    AND p.amount = abs(bt.amount) AND p.date::date = bt.date::date
    AND p.reference IS NOT DISTINCT FROM bt.reference AND p."paidFromAccountId" = ba."linkedAccountId"
    AND abs(extract(epoch FROM (p."createdAt" - bt."updatedAt"))) <= 60
),
uniq AS (
  SELECT c.line_id, c.pay_id FROM cand c
  WHERE (SELECT count(*) FROM cand x WHERE x.line_id = c.line_id) = 1
    AND (SELECT count(*) FROM cand y WHERE y.pay_id = c.pay_id) = 1
)
UPDATE "payments_made" p SET "bankTransactionId" = uniq.line_id FROM uniq WHERE p.id = uniq.pay_id;
