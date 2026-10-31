-- Audit F2 follow-up: before the per-endpoint dedupe key, every endpoint subscribed to
-- invoice.overdue already heard about each overdue invoice under the old org-wide key. Start the
-- cutoff of the endpoints that exist at deploy time now (UTC, like every Prisma timestamp), so the
-- key change never re-announces those debts; the scanner also treats a legacy-key notice as sent.
-- Only rows without a cutoff change: a later cutoff or the "send backlog" epoch stays as it is.
UPDATE "webhook_endpoints"
SET "overdueNoticesFrom" = (now() AT TIME ZONE 'UTC')
WHERE "overdueNoticesFrom" IS NULL;
