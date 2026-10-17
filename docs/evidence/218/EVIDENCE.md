# EVIDENCE — Issue #218: dashboard KPI showed 17782.1 instead of 2540.3

Base: `f972414` (master at branch point). Head: the commit that contains this file.
Every exit code below was observed in the session that wrote this file (2026-10-17); nothing is inferred.

Root cause: `use-dashboard-filters.ts` defaulted to the `last12Months` preset, so the "monthly" revenue KPI showed a
12-month total. The default is now `thisMonth`; a new `all` preset (from 2000-01-01) keeps the full history reachable.

## Acceptance criteria → proof

| AC  | Criterion                                                                   | Automated proof                                                                                                               | Status                 |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC1 | No `period` → KPI = current calendar month                                  | Unit: `dashboard period filter › defaults to the current calendar month`. E2E: `@issue-218 AC1`                               | unit PASS; e2e not run |
| AC2 | `?period=all` → full-history total                                          | Unit: `parses ?period=…`, `"all" reaches back further than the month`. E2E: `@issue-218 AC2`                                  | unit PASS; e2e not run |
| AC3 | Selector change re-fetches with a new from/to and KPI changes               | Unit: `requests a different range (and query key) when the period changes`. E2E: `@issue-218 AC3`                             | unit PASS; e2e not run |
| AC4 | Reload with the same `period` renders the same KPI                          | E2E: `@issue-218 AC4`. Unit support: `parsePeriod` accepts `all` and `lastMonth`, rejects invalid values (`parses ?period=…`) | unit PASS; e2e not run |
| AC5 | `apps/web/lib/hooks/use-dashboard.spec.ts` passes                           | Command 3 below                                                                                                               | PASS (exit 0)          |
| AC6 | Sections use the same range (task item: pass resolved `dateRange` to hooks) | `use-dashboard-sections.spec.ts` (5 tests): months/days window from range, refetch on range change, legacy default            | PASS (exit 0)          |

E2E (`e2e-army/218-dashboard-period.e2e.ts`) was **not executed**: the `@e2e-dev/web` / `e2e` packages are not
installed in this worktree (`node_modules/@e2e-dev` and `node_modules/e2e` do not exist) and there is no seeded stack
here. The 2540.3 / 17782.1 constants are the seeded-org figures quoted in the issue. Run them with the army runner
before accepting AC1–AC4 end to end.

## Commands and observed exit codes (run from the repo root)

| #   | Command                                                                           | Exit | Output                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm --filter @mizano/web type-check`                                            | 0    | `tsc --noEmit`, no errors                                                                                                                                       |
| 2   | `pnpm --filter @mizano/web lint`                                                  | 0    | 13 warnings, all in files this branch does not touch (`use-all-settings.spec.ts`, `use-organization-settings.spec.ts`, and unrelated pages); 0 in changed files |
| 3   | `cd apps/web && pnpm exec jest --maxWorkers=2 --findRelatedTests <changed files>` | 0    | 2 suites, 20 tests passed                                                                                                                                       |
| 4   | Same specs run on base (see below)                                                | 1    | 7 failed, 13 passed                                                                                                                                             |

`<changed files>`: `use-dashboard-sections.ts`, `use-dashboard-sections.spec.ts`, `use-dashboard.spec.ts`,
`use-dashboard-filters.ts`, `dashboard-client.tsx`, `date-range-picker.tsx`, `sections/*.tsx`.

Lint note: `pnpm ci:full` asks for zero warnings; the 13 above exist on base too and are outside this issue's files.

## New tests fail on base, pass on head

Method: detached worktree at `f972414`, head versions of `use-dashboard.spec.ts` and `use-dashboard-sections.spec.ts`
copied over the base source, `pnpm exec jest lib/hooks/use-dashboard.spec.ts lib/hooks/use-dashboard-sections.spec.ts`.

Base (`f972414`) — exit 1, `Tests: 7 failed, 13 passed`:

- ● dashboard period filter › defaults to the current calendar month
- ● dashboard period filter › parses ?period= and falls back to this month for invalid values
- ● dashboard period filter › requests a different range (and query key) when the period changes
- ● dashboard section period window › converts the resolved range to a trailing month/day window
- ● dashboard section period window › hooks › requests the window of the passed range and refetches when the range changes
- ● dashboard section period window › hooks › uses a day window for day-based endpoints
- ● dashboard section period window › keeps the legacy window when no range is passed

Head — exit 0, `Tests: 20 passed`, both suites PASS.

`"all" reaches back further than the month` passes on base too: base's `getPresetDates('all')` falls into the
`last12Months` default, which still starts before the 1st of the month. It guards the shape, not the 2000 start date;
the `startDate=2000-01-01` assertion in the re-fetch test is what pins that.

## Design note — section charts (AC6)

The 13 section endpoints that are range-aware take a trailing window (`months=N` / `days=N`), not `startDate`/`endDate`,
and the API was not changed. The hooks convert the resolved range to a window (`rangeToMonths`, `rangeToDays`); the
API clamps it, so `all` becomes the widest window allowed. Hooks without a window parameter (statuses, headcount,
stock levels, forecasts) are left alone. Visible consequence: with the default `thisMonth`, trend charts now plot one
month (previously six). Reviewers: say if trend charts should keep a minimum of 6 months instead.
