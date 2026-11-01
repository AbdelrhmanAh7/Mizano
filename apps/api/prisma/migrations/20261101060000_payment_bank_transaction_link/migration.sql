-- A payment already in the books is reconciled by linking it to its bank statement line (#635):
-- nothing is posted again, and a payment can be linked to one line only.
ALTER TABLE "payments_received" ADD COLUMN "bankTransactionId" TEXT;
ALTER TABLE "payments_made" ADD COLUMN "bankTransactionId" TEXT;

CREATE UNIQUE INDEX "payments_received_bankTransactionId_key" ON "payments_received"("bankTransactionId");
CREATE UNIQUE INDEX "payments_made_bankTransactionId_key" ON "payments_made"("bankTransactionId");

-- Bank lines reconciled before this release settled an open invoice or bill by recording a new
-- payment for exactly that line: same document, the line's absolute amount, its day, its reference,
-- the bank's ledger account, by bank transfer, allocated in full. Link those payments now so they
-- are never offered for another line. Identical lines and payments (same key) pair one to one in
-- creation order; anything without such evidence stays unlinked.
WITH line AS (
  SELECT bt.id, bt."organizationId", bt."matchedEntityId" AS doc, abs(bt.amount) AS amount,
         bt.date::date AS day, bt.reference, ba."linkedAccountId" AS account,
         row_number() OVER (
           PARTITION BY bt."organizationId", bt."matchedEntityId", abs(bt.amount), bt.date::date,
                        bt.reference, ba."linkedAccountId"
           ORDER BY bt."updatedAt", bt.id) AS n
  FROM "bank_transactions" bt
  JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
  WHERE bt.status = 'MATCHED' AND bt."matchedEntityType" = 'invoice' AND bt.type = 'DEPOSIT'
),
pay AS (
  SELECT p.id, p."organizationId", a."invoiceId" AS doc, p.amount, p.date::date AS day, p.reference,
         p."depositToAccountId" AS account,
         row_number() OVER (
           PARTITION BY p."organizationId", a."invoiceId", p.amount, p.date::date, p.reference,
                        p."depositToAccountId"
           ORDER BY p."createdAt", p.id) AS n
  FROM "payments_received" p
  JOIN "payment_allocations" a ON a."paymentId" = p.id AND a.amount = p.amount
  WHERE p."deletedAt" IS NULL AND p."bankTransactionId" IS NULL AND p."paymentMode" = 'BANK_TRANSFER'
)
UPDATE "payments_received" p SET "bankTransactionId" = line.id
FROM line
JOIN pay ON pay."organizationId" = line."organizationId" AND pay.doc = line.doc
        AND pay.amount = line.amount AND pay.day = line.day
        AND pay.reference IS NOT DISTINCT FROM line.reference
        AND pay.account = line.account AND pay.n = line.n
WHERE p.id = pay.id;

WITH line AS (
  SELECT bt.id, bt."organizationId", bt."matchedEntityId" AS doc, abs(bt.amount) AS amount,
         bt.date::date AS day, bt.reference, ba."linkedAccountId" AS account,
         row_number() OVER (
           PARTITION BY bt."organizationId", bt."matchedEntityId", abs(bt.amount), bt.date::date,
                        bt.reference, ba."linkedAccountId"
           ORDER BY bt."updatedAt", bt.id) AS n
  FROM "bank_transactions" bt
  JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
  WHERE bt.status = 'MATCHED' AND bt."matchedEntityType" = 'bill' AND bt.type = 'WITHDRAWAL'
),
pay AS (
  SELECT p.id, p."organizationId", a."billId" AS doc, p.amount, p.date::date AS day, p.reference,
         p."paidFromAccountId" AS account,
         row_number() OVER (
           PARTITION BY p."organizationId", a."billId", p.amount, p.date::date, p.reference,
                        p."paidFromAccountId"
           ORDER BY p."createdAt", p.id) AS n
  FROM "payments_made" p
  JOIN "bill_allocations" a ON a."paymentId" = p.id AND a.amount = p.amount
  WHERE p."deletedAt" IS NULL AND p."bankTransactionId" IS NULL AND p."paymentMode" = 'BANK_TRANSFER'
)
UPDATE "payments_made" p SET "bankTransactionId" = line.id
FROM line
JOIN pay ON pay."organizationId" = line."organizationId" AND pay.doc = line.doc
        AND pay.amount = line.amount AND pay.day = line.day
        AND pay.reference IS NOT DISTINCT FROM line.reference
        AND pay.account = line.account AND pay.n = line.n
WHERE p.id = pay.id;
