-- External ETA issuer's reference only: no posting, tax submission or backfill.
ALTER TABLE "invoices" ADD COLUMN "externalEInvoiceNumber" VARCHAR(100);
ALTER TABLE "credit_notes" ADD COLUMN "externalEInvoiceNumber" VARCHAR(100);
CREATE UNIQUE INDEX "invoices_organizationId_externalEInvoiceNumber_key"
  ON "invoices"("organizationId", "externalEInvoiceNumber");
CREATE UNIQUE INDEX "credit_notes_organizationId_externalEInvoiceNumber_key"
  ON "credit_notes"("organizationId", "externalEInvoiceNumber");
