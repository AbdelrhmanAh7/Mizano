-- Grant the new tax.submit action to stored roles that can already edit tax.
-- The VAT return submit/file/bulk-submit routes require tax.submit; the default Admin and
-- Accountant roles carry it in code, but roles are copied into each organization at creation,
-- so existing organizations keep the old action list. "Already has tax.edit" is the stored
-- evidence (no guessing by role name); no other permission is touched. Idempotent.
UPDATE "permissions"
SET "actions" = array_append("actions", 'submit')
WHERE "module" = 'tax'
  AND 'edit' = ANY("actions")
  AND NOT ('submit' = ANY("actions"));
