# Evidence for #414 (Supersedes part of #354)

Not user-facing (internal scheduler registration), so no e2e-army test.

| AC                                             | Verification                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| AC1 flag false/unset: no cron registered       | `ai-hr-ops.scheduler.spec.ts` cases undefined / 'false' / '' (provider yields an inert object, not AiHrOpsScheduler) |
| AC2 flag true: scheduler instantiated          | same spec, `'true'` case                                                                                             |
| AC3 test covers it                             | `cd apps/api && npx jest src/modules/ai/schedulers/ai-hr-ops.scheduler.spec.ts` -> 4 passed                          |
| AC4 fresh branch off master, no workflow edits | `git diff master --stat`                                                                                             |
