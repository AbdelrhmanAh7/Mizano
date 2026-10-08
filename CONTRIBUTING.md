# Contributing

## Git hooks (fast by design)

No hook or pipeline may exceed 5 minutes.

| Hook         | What runs                                                                | Budget  |
| ------------ | ------------------------------------------------------------------------ | ------- |
| `pre-commit` | `lint-staged` (ESLint + Prettier) on staged files only                   | <= 60 s |
| `pre-push`   | `turbo type-check test --filter='...[origin/master]'` (affected packages) | <= 290 s |

The hooks are a fast gate only. The full CI (lint, type-check, all unit tests, e2e) runs
through the hub's **localci**, sharded and under the 5-minute unit cap, and must be green before merge.
Run the whole monorepo suite manually with `pnpm ci:full` when you need it.
