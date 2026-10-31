-- Audit F2: invoice.overdue is sent only for invoices whose due date passed after the endpoint
-- subscribed. Additive and nullable; null falls back to the endpoint's createdAt, so no backfill.
ALTER TABLE "webhook_endpoints" ADD COLUMN "overdueNoticesFrom" TIMESTAMP(3);
