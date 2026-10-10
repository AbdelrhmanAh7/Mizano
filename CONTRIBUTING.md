# Contributing

## Git hooks (fast by design)

No hook or pipeline may exceed 5 minutes.

| Hook         | What runs                                                                | Budget  |
| ------------ | ------------------------------------------------------------------------ | ------- |
| `pre-commit` | `lint-staged` (ESLint + Prettier) on staged files only                   | <= 60 s |
| `pre-push`   | `scripts/pre-push.mjs`: `turbo type-check test --filter='...[<base>...<pushed sha>]'` per pushed ref (affected packages only) | <= 290 s |

The hooks are a fast gate only. The full CI (lint, type-check, all unit tests, e2e) runs
through the hub's **localci**, sharded and under the 5-minute unit cap, and must be green before merge.
Run the whole monorepo suite manually with `pnpm ci:full` when you need it.

How `pre-push` works (`scripts/pre-push.mjs`, helpers in `scripts/pre-push-lib.mjs`):

- It reads the refs git sends on stdin, skips deletions, and for each pushed sha diffs against the remote sha
  (or the merge-base with `origin/master` for a new branch), so exactly what is being pushed is checked.
- If a pushed sha is not the checked-out `HEAD` it fails and asks you to check out that branch and push again.
- A watchdog runs turbo in its own process group and kills the whole group after 290 s, prints
  `pre-push budget exceeded` and exits 1. There is no skip flag; if the gate is too slow, fix the tests.
- Unit tests for the parsing, base selection and watchdog: `node --test scripts/pre-push.test.mjs`.
