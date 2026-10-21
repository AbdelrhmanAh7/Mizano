# AI_QUESTIONS — #133

## Follow-up issue to open: move the intake extraction worker out of the API process

CTO decision (2026-10-12): PR #144 is narrowed to what it delivers (scheduler gating, ollama-tunnel and
ollama-proxy removal, narrative dedupe, notification cursor paging). The PR body must read **`Refs #133`**,
not `Closes #133`. The harness owns the PR body, so this is recorded here.

### Confirmation: PR Description Must Not Auto-Close #133 (Finding 862c1a099357)

- PR relation: **`Refs #133`** (MUST NOT use `Closes #133` or `Fixes #133`).
- Auto-close prevention: Issue #133 AC1 (API starts without tesseract.js/pdf-parse loaded) and AC2 (intake e2e with worker container) are NOT resolved by this PR. The BullMQ worker (`IntakeProcessorService` / `IntakeQueueService`) remains in the API container for now and is moved to dedicated worker extraction issue #141 (and branches `ai/42`/`ai/39`).
- Only AC3 (narrative dedupe), dead code deletion (ollama-tunnel and ollama-proxy), AI scheduler gating (`AI_SCHEDULERS_ENABLED`), and notification cron cursor pagination are delivered here.

The worker move is **not** done on this branch and must not be claimed as done. Proposed follow-up issue:

- **Title**: Move intake extraction into its own worker container (finish #133 AC1/AC2)
- **Do**: pick `ai/42`'s worker entrypoint, rebase `ai/39`'s compose on it, remove
  `IntakeProcessorService`/`IntakeQueueService` worker registration from the API app
  (`ai-operations.module.ts:59-60`, `intake-processor.service.ts:47`), flip the commented-out `worker` service
  in `deploy/pi/docker-compose.pi.yml` on.
- **Acceptance** (unchanged from #133): the API container starts without `tesseract.js` / `pdf-parse` loaded
  (check process memory and `require.cache`); the intake e2e passes with the worker container.
- **Blocked by**: #42 (branch `ai/42`, currently RUNNING per the team plan) and #39. See `docs/follow-ups.md`.

## CI suggestion (not applied — CI changes stop at the owner)

None needed for this change.
