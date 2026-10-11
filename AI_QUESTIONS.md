# AI questions — PR #189 (rework round 1)

The agent cannot edit the PR description or start a `workflow_dispatch` run (the harness pushes; no Postgres/Docker on the agent host). Two items of the CTO rework therefore need the owner or the harness:

1. **Run the nightly on this branch** after the push: `gh workflow run nightly.yml --ref chore/slim-mz-tests`, then add the run link and the duration of each of the 6 `API e2e (real DB) i/6` jobs and the `ollama-proxy` job to the PR body. The total test count (expected 203) is the sum of the 6 shard summaries. If a shard goes over 5 minutes, raise the shard count in `nightly.yml` (matrix list and `/6`) rather than the timeout.
2. **Replace the PR body sections** with the text below (the spec-by-spec table is also in `docs/DEVELOPMENT.md` > Testing).

```markdown
## Removed / kept web specs

| Spec (apps/web/)                                                                                  | Outcome                                    | e2e-army test (hub tests-dev/Mizano)                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| accounting/journals/page.spec.tsx: inline transformJournal copy                                   | removed (tested a copy in the spec)        | n/a; the 3 page tests stay                                     |
| components/ui/command.spec.tsx                                                                    | removed                                    | mz-global-search.1                                             |
| lib/hooks/use-bulk-action.spec.tsx                                                                | removed                                    | mz-journals.2, mz-sales-invoices.3, mz-purchase-bills.3        |
| components/layout/sidebar.spec.tsx                                                                | removed                                    | mz-app-shell.1                                                 |
| components/layout/breadcrumbs.spec.tsx                                                            | removed                                    | mz-app-shell.1 (asserts the breadcrumb trail)                  |
| components/dashboard/stat-card.spec.tsx                                                           | removed                                    | mz-dashboard.1                                                 |
| hr/{page,employees,employees/[id],attendance,payroll/run}, components/hr/employee-form            | trimmed to named-bug regression cases      | generic renders: mz-employees.1, mz-attendance.1, mz-payroll.1 |
| manufacturing/{bom/[id],work-orders}                                                              | trimmed to named-bug regression cases      | generic renders: mz-bom.1, mz-work-orders.1                    |
| ai-insights/[id], assets, assets/[id], banking/transactions, components/banking/bank-account-form | kept in full (past crashes)                | —                                                              |
| components/logger/logger-dashboard.spec.tsx                                                       | kept (e2e-army covers only the logger API) | —                                                              |

## Numbers

Web unit tests 48 suites / 458 tests → 43 / 376 (restored: 5 regression specs in full = 40 tests, logger-dashboard = 14, 8 trimmed HR/manufacturing specs = 38). API unit tests unchanged. API e2e specs: 0 runs → nightly, 6 shards, each job capped at 5 minutes (durations not measured yet).

## Verification

Run locally on the changed files only (the full suite runs on GitHub CI): web jest on the 14 restored/trimmed specs and the journals spec all pass, eslint --max-warnings 0 and prettier pass on them, ollama-proxy unittest passes with the pinned requirements on Python 3.12 (14 tests). `pnpm test:e2e --listTests --shard=i/6` lists all 11 specs across the 6 shards. Nightly run: <link + per-shard durations>.
```
