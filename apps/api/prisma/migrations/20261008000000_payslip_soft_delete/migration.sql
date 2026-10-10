-- Payslips are soft-deleted with their payroll run (#130).
ALTER TABLE "payslips" ADD COLUMN "deletedAt" TIMESTAMP(3);
