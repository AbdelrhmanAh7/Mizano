# Contributing

## Git hooks (fast by design)

No hook or pipeline may exceed 5 minutes.

| Hook         | What runs                                                                                                 | Budget   |
| ------------ | --------------------------------------------------------------------------------------------------------- | -------- |
| `pre-commit` | `lint-staged` (ESLint + Prettier) on staged files only                                                    | <= 60 s  |
| `pre-push`   | `turbo run type-check test --filter=...[<base>]` for the packages the push changes (and their dependents) | <= 290 s |

The hooks are a fast gate only. The full CI (lint, type-check, all unit tests, build, e2e) runs
through the hub's **localci**, sharded and under the 5-minute unit cap, and must be green before merge.
Run the whole monorepo suite manually with `pnpm ci:full` when you need it.

How `.husky/pre-push` works:

- It reads the refs git sends on stdin; `<base>` is the remote's old sha, or the merge-base with
  `origin/master` for a new branch. Root config changes (`package.json`, lockfile, `turbo.json`, `tsconfig*`)
  or a pushed sha that differs from the checked-out `HEAD` check every package.
- A perl watchdog kills the whole process group after 290 s (`MZ_PREPUSH_LIMIT_SECONDS` overrides it).
- A worktree without `node_modules` skips with a note instead of installing anything.
- Escape hatch: `SKIP_LOCAL_CI=1 git push` (or `HUSKY=0`); localci still runs the full CI.
