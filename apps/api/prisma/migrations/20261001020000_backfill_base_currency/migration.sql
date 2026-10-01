-- Registration used to set "currency" but leave "baseCurrency" at the schema default (SAR).
-- Reports and bill approval now use baseCurrency, so align organizations that have not yet
-- chosen a base currency in onboarding (company info step not completed).
UPDATE "organizations" o
SET "baseCurrency" = o."currency"
WHERE o."baseCurrency" <> o."currency"
  AND NOT EXISTS (
    SELECT 1 FROM "organization_onboarding" ob
    WHERE ob."organizationId" = o."id" AND ob."companyInfoCompleted" = true
  );
