# Contributing

## Git hooks (fast by design)

No git hook or CI job may exceed 5 minutes.

| Hook         | What runs                                                                                                 | Budget   |
| ------------ | --------------------------------------------------------------------------------------------------------- | -------- |
| `pre-commit` | `_lint_staged.js` (ESLint `--fix` + Prettier) on staged files only                                        | <= 60 s  |
| `pre-push`   | `turbo run type-check test --filter=...[<base>]` for the packages the push changes (and their dependents) | <= 290 s |

The hooks are a fast gate only. `pre-commit` runs the custom `_lint_staged.js` runner (it hard-codes its
file groups and does not read the `lint-staged` block in `package.json`). The full CI is not a hook:
`pnpm ci:full` runs lint, type-check and unit tests (no E2E, no build); the hub's **localci** job runs it
(plus the build), sharded, and posts the GitHub commit statuses under the `ci.yml` job names. Feature E2E is a
separate gate, the `e2e-army` commit status (see `docs/DEVELOPMENT.md`). All of these must be green before merge.
Run `pnpm ci:full` manually when you need the whole monorepo suite locally.

How `.husky/pre-push` works:

- It reads the refs git sends on stdin; `<base>` is the remote's old sha, or the merge-base with
  `origin/master` for a new branch. Root config changes (`package.json`, lockfile, `turbo.json`, `tsconfig*`)
  or a pushed sha that differs from the checked-out `HEAD` check every package.
- When the pushed changes include `apps/api/prisma/schema.prisma` the hook regenerates the Prisma client first.
- A perl watchdog kills the whole process group after 290 s (`MZ_PREPUSH_LIMIT_SECONDS` overrides it).
- A worktree without `node_modules` skips with a note instead of installing anything.
- Escape hatch: `SKIP_LOCAL_CI=1 git push` (or `HUSKY=0`); localci still runs the full CI.
- `python3 -m unittest discover -s scripts -p 'test_husky_hooks.py'` runs the real hook against a throwaway repo with
  stub tools: ref parsing, base selection (deleted ref, new branch, multi-ref, non-HEAD sha), root-config and schema
  triggers, the skip paths and the watchdog kill.

Measured on the Mac mini (2026-10-11): `pre-commit` on a one-file docs change 0.3 s; `pre-push` with no
affected package 0.7 s (turbo runs 0 tasks); `pre-push` over all 4 packages with a warm turbo cache 3.4 s. A cold run of real
packages was not timed (a manual type-check did not finish within 200 s on the busy shared Mac). Budgets are hard caps enforced by the watchdogs.
