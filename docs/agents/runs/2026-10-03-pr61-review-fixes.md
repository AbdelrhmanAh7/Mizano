# PR #61 review fixes

- Issue: https://github.com/AbdelrhmanAh7/Mizano/issues/21
- PR: https://github.com/AbdelrhmanAh7/Mizano/pull/61
- Provider: OpenAI Codex / GPT-6 (session identity).
- Branch: `demo/21-accountant-inbox`; baseline HEAD: `3c5b91d344baa70638e4d77330145a97258834bf`.
- Local `origin/master`: `1d37f28ac87ba7ce6621fd09eb76664c51635eda` (live GitHub verification unavailable: REST 404 / GraphQL 401).
- Lease: owner Codex, run `pr61-review-fixes-20261003`, issue #21; scope limited to the four supplied review findings, covering intake validation/search, breadcrumb localization, original-file opening, their regression tests and review lessons.
- Worktree: `C:/Users/Abdelrahman/Desktop/Personal_Project/mizano-wt/inbox`; initially clean.
- Lease acquired during initial inspection (timestamp not captured); expiry was 2026-10-04T00:00:00+03:00. Final heartbeat/release: 2026-10-03T01:31:36Z; status released.
- Authorization: local uncommitted fixes and scoped validation only; no commits, pushes, GitHub posts, full suites or builds.

## Findings

- `PRRT_kwDORJJA9M6ogxyb`: FIXED. The shared confirmation validator blocks missing/blank document or base currency as well as mismatches. The inbox summary uses the same validator. Bulk tests prove failures remain per job, valid jobs still approve and the organization currency lookup remains scoped. Updated exception descriptions in English and Arabic.
- `PRRT_kwDORJJA9M6ogxy1`: FIXED. Search page and count use one parameterized SQL predicate including organization, deletion, status, source and date filters. Only the requested page is materialized; the count is uncapped. Preserved case-insensitive matching, literal wildcard escaping and added a deterministic id tie-breaker to the search ordering.
- `PRRT_kwDORJJA9M6ogxzF`: FIXED. Inbox breadcrumb uses `navigation.purchases.inbox`; tests use the real en/ar message values and check locale switching and existing fallback labels.
- `PRRT_kwDORJJA9M6ogxzP`: FIXED. Reserve a blank tab before the fetch, detach its opener, navigate after the authenticated response and reject blocked openings. Close failed tabs and revoke blob URLs; a tab closed by the user does not allocate a URL.
- Root-cause search covered the branch diff and all confirmation-validator callers, intake search paths, breadcrumb/sidebar labels and original-file opening. No remaining instances of these causes were found in the branch changes. The pre-existing `use-documents.ts` blob helper is outside this branch's changes.
- Added the root causes to `docs/agents/review-lessons.md`.

## Validation

Tested baseline SHA: `3c5b91d344baa70638e4d77330145a97258834bf` plus this uncommitted patch; no new commit exists.

All commands run from the worktree root, serialized:

```powershell
pnpm.cmd --filter api exec tsc --noEmit --incremental false
pnpm.cmd --filter @mizano/web exec tsc --noEmit --incremental false

pnpm.cmd --filter api exec eslint src/modules/ai/intake/intake-bulk-approve.ts src/modules/ai/intake/intake-bulk-approve.spec.ts src/modules/ai/intake/intake-jobs.service.ts src/modules/ai/intake/intake-jobs.service.spec.ts src/modules/ai/controllers/document-intake-bulk.spec.ts --max-warnings 0
pnpm.cmd --filter @mizano/web exec eslint components/layout/breadcrumbs.tsx components/layout/breadcrumbs.spec.tsx lib/hooks/use-intake-inbox.ts lib/hooks/use-intake-inbox.spec.ts --max-warnings 0

pnpm.cmd --filter api exec jest --runTestsByPath src/modules/ai/intake/intake-bulk-approve.spec.ts src/modules/ai/intake/intake-jobs.service.spec.ts src/modules/ai/controllers/document-intake-bulk.spec.ts --runInBand
pnpm.cmd --filter @mizano/web exec jest --runTestsByPath components/layout/breadcrumbs.spec.tsx lib/hooks/use-intake-inbox.spec.ts components/purchases/intake-inbox.spec.tsx --runInBand
git diff --check
```

- TypeScript: both exit 0.
- ESLint: both exit 0, zero warnings; five API and four web TypeScript files.
- Final API run: three specs, 53 tests passed. Final web run: three specs, 29 tests passed. Total: six specs, 82 tests passed.
- Prettier check on all changed/new files: exit 0. LF and diff whitespace verified.
- Initial command with both `--runInBand --maxWorkers=1` failed because Jest permits only one of these flags; final runs use `--runInBand` for one serial process. No package scripts or gates were weakened.
- Initial API run caught a test fixture type error for an omitted currency. Fixed the fixture by deleting the field from a legacy result and reran successfully; no assertions removed to pass.
- Used `pnpm.cmd` because PowerShell blocks the installed `pnpm.ps1`; execution policy unchanged.

## Remaining scope and next task

- GitHub issue/PR/master state could not be refreshed due to authentication failures; supplied threads and local branch verified instead.
- SQL construction, parameters, bounded page results and uncapped counts were checked by unit tests; PostgreSQL execution and real-browser popup behavior were not tested in this scoped session.
- No full suites, builds, E2E, `ci:full`, independent reviewer invocation, deployment, commits, pushes or GitHub posts.
- Next task: owner reviews the uncommitted diff and arranges independent review and the remaining release gates before merge, according to the repository workflow.
- No active lease or background test process remains.
