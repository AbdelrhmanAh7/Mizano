-- A payment already in the books is reconciled by linking it to its bank statement line (#635):
-- nothing is posted again, and a payment can be linked to one line only.
ALTER TABLE "payments_received" ADD COLUMN "bankTransactionId" TEXT;
ALTER TABLE "payments_made" ADD COLUMN "bankTransactionId" TEXT;

CREATE UNIQUE INDEX "payments_received_bankTransactionId_key" ON "payments_received"("bankTransactionId");
CREATE UNIQUE INDEX "payments_made_bankTransactionId_key" ON "payments_made"("bankTransactionId");

-- Bank lines reconciled before this release settled an open invoice or bill by recording a new
-- payment in the same database transaction that marked the line MATCHED; which payment it was is
-- not stored. Candidates: live or voided payments with the line's document, absolute amount, day,
-- reference and bank ledger account, by bank transfer, allocated in full.
--   * Linked: the only candidate created within a minute of the line being matched, when that line
--     has no other such candidate (a voided one included) and it is not voided.
--   * Unresolved: every other live candidate gets 'unresolved:<payment id>' instead of a line id,
--     so suggestions and confirmation (which only take payments with no link) never offer it to
--     another line. It may be the payment that line already explains; leaving it out is the safe
--     side. Voiding clears it as usual.
CREATE TEMP TABLE legacy_payments_received AS
SELECT bt.id AS line_id, p.id AS pay_id, p."deletedAt" IS NOT NULL AS voided,
       abs(extract(epoch FROM (p."createdAt" - bt."updatedAt"))) <= 60 AS same_moment
FROM "bank_transactions" bt
JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
JOIN "payment_allocations" a ON a."invoiceId" = bt."matchedEntityId"
JOIN "payments_received" p ON p.id = a."paymentId" AND a.amount = p.amount
WHERE bt.status = 'MATCHED' AND bt."matchedEntityType" = 'invoice' AND bt.type = 'DEPOSIT'
  AND p."organizationId" = bt."organizationId" AND p."paymentMode" = 'BANK_TRANSFER'
  AND p.amount = abs(bt.amount) AND p.date::date = bt.date::date
  AND p.reference IS NOT DISTINCT FROM bt.reference AND p."depositToAccountId" = ba."linkedAccountId";

UPDATE "payments_received" p SET "bankTransactionId" = c.line_id
FROM legacy_payments_received c
WHERE p.id = c.pay_id AND c.same_moment AND NOT c.voided AND p."bankTransactionId" IS NULL
  AND (SELECT count(*) FROM legacy_payments_received x WHERE x.line_id = c.line_id AND x.same_moment) = 1
  AND (SELECT count(*) FROM legacy_payments_received y WHERE y.pay_id = c.pay_id AND y.same_moment) = 1;

UPDATE "payments_received" p SET "bankTransactionId" = 'unresolved:' || p.id
FROM legacy_payments_received c
WHERE p.id = c.pay_id AND NOT c.voided AND p."bankTransactionId" IS NULL;

CREATE TEMP TABLE legacy_payments_made AS
SELECT bt.id AS line_id, p.id AS pay_id, p."deletedAt" IS NOT NULL AS voided,
       abs(extract(epoch FROM (p."createdAt" - bt."updatedAt"))) <= 60 AS same_moment
FROM "bank_transactions" bt
JOIN "bank_accounts" ba ON ba.id = bt."bankAccountId" AND ba."organizationId" = bt."organizationId"
JOIN "bill_allocations" a ON a."billId" = bt."matchedEntityId"
JOIN "payments_made" p ON p.id = a."paymentId" AND a.amount = p.amount
WHERE bt.status = 'MATCHED' AND bt."matchedEntityType" = 'bill' AND bt.type = 'WITHDRAWAL'
  AND p."organizationId" = bt."organizationId" AND p."paymentMode" = 'BANK_TRANSFER'
  AND p.amount = abs(bt.amount) AND p.date::date = bt.date::date
  AND p.reference IS NOT DISTINCT FROM bt.reference AND p."paidFromAccountId" = ba."linkedAccountId";

UPDATE "payments_made" p SET "bankTransactionId" = c.line_id
FROM legacy_payments_made c
WHERE p.id = c.pay_id AND c.same_moment AND NOT c.voided AND p."bankTransactionId" IS NULL
  AND (SELECT count(*) FROM legacy_payments_made x WHERE x.line_id = c.line_id AND x.same_moment) = 1
  AND (SELECT count(*) FROM legacy_payments_made y WHERE y.pay_id = c.pay_id AND y.same_moment) = 1;

UPDATE "payments_made" p SET "bankTransactionId" = 'unresolved:' || p.id
FROM legacy_payments_made c
WHERE p.id = c.pay_id AND NOT c.voided AND p."bankTransactionId" IS NULL;

DROP TABLE legacy_payments_received;
DROP TABLE legacy_payments_made;
