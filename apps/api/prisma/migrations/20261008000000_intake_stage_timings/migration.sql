-- Per-stage worker timings for intake jobs (#126). Additive and nullable.
ALTER TABLE "intake_jobs" ADD COLUMN "stageTimingsMs" JSONB;
