# Contributing

## Git hooks (fast by design)

No git hook or CI job may exceed 5 minutes.

| Hook         | What runs                                                                                                 | Budget   | Measured (Mac mini)                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `pre-commit` | `_lint_staged.js` (ESLint `--fix` + Prettier) on staged files only; preserves unstaged hunks              | <= 60 s  | 0.3 s (staged docs) to 1.2 s (staged TS)                                                             |
| `pre-push`   | `turbo run type-check test --filter=...[<base>]` for the packages the push changes (and their dependents) | <= 290 s | 0.7 s (0 packages affected), 3.4 s (warm turbo cache replay), ~20–40 s (cold run on changed package) |

The hooks are a fast gate only. `pre-commit` runs the custom `_lint_staged.js` runner (it hard-codes its
file groups and preserves unstaged hunks in partially staged files, rather than using the `lint-staged` block
in `package.json`). The full CI is not a hook: `pnpm ci:full` runs lint, type-check and unit tests (no E2E, no build);
the hub's **localci** job runs it (plus the build), sharded, and posts the GitHub commit statuses under the
`ci.yml` job names. Feature E2E is a separate gate, the `e2e-army` commit status (see `docs/DEVELOPMENT.md`).
All of these must be green before merge. Run `pnpm ci:full` manually when you need the whole monorepo suite locally.

How `.husky/pre-push` works:

- It reads the refs git sends on stdin; `<base>` is the remote ref's old sha, or the merge-base with
  `origin/master` for a new branch. Root config changes (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `.npmrc`, `turbo.json`, `tsconfig*` including `tsconfig.json`, `tsconfig.base.json`, etc.) or a pushed sha that
  differs from the checked-out `HEAD` check every package.
- When the pushed changes include `apps/api/prisma/schema.prisma` the hook regenerates the Prisma client first.
- A perl watchdog kills the whole process group after 290 s (`MZ_PREPUSH_LIMIT_SECONDS` overrides it).
- A worktree without `node_modules` skips with a note instead of installing anything.
- Escape hatch: `SKIP_LOCAL_CI=1 git push` (or `HUSKY=0`); localci still runs the full CI.
- `python3 -m unittest discover -s scripts -p 'test_husky_hooks.py'` runs the real hook against a throwaway repo with
  stub tools: ref parsing, base selection (deleted ref, new branch, multi-ref, non-HEAD sha), root-config (including
  `pnpm-workspace.yaml` and `.npmrc`) and schema triggers, the skip paths, and the watchdog kill; the same file runs
  the real `pre-commit` against `_lint_staged.js` (staged files only, unstaged hunk preservation, blocking exit code,
  skip path, 60 s watchdog).

Measured on the Mac mini:

- `pre-commit`: 0.3 s on a staged docs change, ~1.2 s on staged TypeScript files (enforced <= 60 s watchdog).
- `pre-push`:
  - **No affected packages (0 tasks):** 0.7 s when pushing ref deletions or non-package changes.
  - **Warm turbo cache scenario:** 3.4 s when running type-check and tests across packages with cached artifacts (turbo replay).
  - **Cold changed package:** ~20–40 s when type-checking and testing a changed package and its direct dependents with a cold cache (cold run across all packages takes ≤ 2.5 min; enforced <= 290 s watchdog).

All measurements fit safely within the <= 60 s and <= 290 s budgets. Budgets are hard caps enforced by the watchdogs.
