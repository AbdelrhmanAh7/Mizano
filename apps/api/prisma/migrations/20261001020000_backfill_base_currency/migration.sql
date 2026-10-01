-- Registration used to set "currency" but leave "baseCurrency" at the schema default (SAR).
-- Reports and bill approval now use baseCurrency, so align only organizations that provably still
-- hold that untouched default: baseCurrency is the default SAR, the legacy currency differs, and
-- the onboarding company-info step (where a base currency is chosen) was never completed.
-- A base currency chosen explicitly in settings is anything other than the default and is kept.
UPDATE "organizations" o
SET "baseCurrency" = o."currency"
WHERE o."baseCurrency" = 'SAR'
  AND o."currency" <> 'SAR'
  AND NOT EXISTS (
    SELECT 1 FROM "organization_onboarding" ob
    WHERE ob."organizationId" = o."id" AND ob."companyInfoCompleted" = true
  );
