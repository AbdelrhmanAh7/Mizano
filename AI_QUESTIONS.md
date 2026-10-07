# Open questions for issue #42

The code half of #42 is implemented and tested on a development host (see `EVIDENCE.md`). These
acceptance items need the owner, the Pi or the #24 corpus. The AI implementer cannot do them.

1. **On-Pi measurements.** The acceptance requires p50/p95 latency and peak RAM per document type,
   measured on the Pi 5 with the held-out #24 corpus. There is no Pi and no held-out corpus in this
   environment, so these are still unknown. Who runs the protocol in
   `docs/strategy/pi-cpu-extraction-runtime.md` ("Pi acceptance protocol"), and where does the
   frozen #24 corpus live?
2. **API p95 threshold.** The issue says "under an agreed threshold", but no threshold has been
   agreed. The 50 ms bound in `intake-backlog-responsiveness.spec.ts` is only a simulated unit-test
   bound. What p95 (authenticated API probe on the Pi, during a batch) should be the gate?
3. **Issue state.** Until 1 and 2 have evidence, should PR #93 say `Refs #42` instead of
   `Closes #42`, so merging it does not close the issue? A follow-up issue for the Pi measurement run
   would keep that work tracked.
4. **Linux-only and infra-backed tests.** `intake-executor.process.spec.ts` (real `prlimit`) skips on
   macOS/Windows, and `test/intake.e2e-spec.ts` needs PostgreSQL and Redis. Neither could run on this
   host (no Docker). Please confirm the Linux CI job runs both on the PR head.
