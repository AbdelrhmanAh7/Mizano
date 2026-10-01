-- Accounts were created with the schema default currency 'USD' regardless of the organization's
-- base currency. Posting now requires bank/cash accounts to be in the base currency, so align
-- accounts still holding that default in non-USD organizations. Accounts linked to a bank
-- account explicitly kept in USD are real foreign-currency accounts and are left untouched.
UPDATE "accounts" a
SET "currency" = o."baseCurrency"
FROM "organizations" o
WHERE a."organizationId" = o."id"
  AND a."currency" = 'USD'
  AND o."baseCurrency" <> 'USD'
  AND NOT EXISTS (
    SELECT 1 FROM "bank_accounts" b
    WHERE b."linkedAccountId" = a."id" AND b."currency" = 'USD'
  );
