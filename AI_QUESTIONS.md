# Questions for #125

1. **Web report is outside the issue scope.** #125 and its spec list "Frontend UI, hooks, or i18n message changes" as out of scope, but the hub verifier opened `/en/reports/reconciliation/ap` and looked for an "AP Reconciliation" link. Commit `1b3ba31` added that page (about 380 lines in `apps/web`), which also pushes the PR past the ~300-line limit.
   - Keep it (the verifier needs it), or drop `1b3ba31` and make the verifier call the API route `GET /api/reports/reconciliation/ap` instead?
   - If it stays, it probably belongs in its own follow-up PR: backend in this one (`9842cf5`), UI on top.
2. `apps/api` `tsc --noEmit` fails on `js-yaml` types in `coderabbit-config.spec.ts` in worktrees installed before master #157. This is an install issue, not part of #125.
