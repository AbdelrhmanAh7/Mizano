-- Columns present in schema.prisma but never captured in a migration.
-- Additive only: obsolete AI tables/columns are intentionally left in place
-- (dropping them would destroy data on existing databases).
ALTER TABLE "bank_rules" ADD COLUMN IF NOT EXISTS "hitCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "plannedEndDate" TIMESTAMP(3);
