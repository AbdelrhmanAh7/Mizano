-- Audit B9: keep the customer's reference (for example a purchase order number) typed on an
-- invoice. Additive and nullable; existing invoices keep no reference.
ALTER TABLE "invoices" ADD COLUMN "reference" TEXT;
