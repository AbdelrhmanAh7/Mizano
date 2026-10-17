# AI_QUESTIONS: PR #189 (owner action needed)

The three open QA findings (round 3) are about the PR **description**, not the code. The description is the text from before commit `1a87dda` restored the regression specs, so it no longer matches the head. The agent has no way to edit it (api.github.com is unreachable from the sandbox; `gh pr view` fails with a TLS error).

**Question:** please replace the PR description with the text below (it is measured on head `11387c2`). Delete this file afterwards; it exists only because the description cannot be edited from here.

---

## Replacement PR description

Slim-down PR 2 of 3 for Mizano (plan: `docs/slimdown-plan.md` in #188). Supersedes #155.

### What changed

- **Removed (5 spec files):** `components/ui/command.spec.tsx`, `lib/hooks/use-bulk-action.spec.tsx`, `components/layout/sidebar.spec.tsx`, `components/layout/breadcrumbs.spec.tsx`, `components/dashboard/stat-card.spec.tsx`.
- **Trimmed (9 spec files, still suites):** the inline `transformJournal` copy in `accounting/journals/page.spec.tsx`; HR (`hr/page`, `hr/employees`, `hr/employees/[id]`, `hr/attendance`, `hr/payroll/run`, `components/hr/employee-form`) and manufacturing (`manufacturing/bom/[id]`, `manufacturing/work-orders`) specs cut to their named-bug regression cases.
- **Kept in full (past production crashes):** `ai-insights/[id]`, `assets`, `assets/[id]`, `banking/transactions` page specs, `components/banking/bank-account-form.spec.tsx`, `components/logger/logger-dashboard.spec.tsx`. An earlier draft of this PR removed them; `1a87dda` restored them, so they are **not** in the diff.
- **New `.github/workflows/nightly.yml`** (cron 01:17 UTC + `workflow_dispatch`, never on PRs, not a required check, `permissions: contents: read`, actions pinned to SHAs, every job `timeout-minutes: 5`): the 11 API e2e specs in `apps/api/test` against Postgres 16 + Redis 7 (`db:push`, `db:seed`), split into 6 `--shard=i/6` jobs, plus the ollama-proxy python tests.
- **ollama-proxy (`services/ollama-proxy/`)**: new `requirements.txt` pins `fastapi==0.143.0`, `httpx==0.28.1`, `uvicorn==0.54.0`. The `Dockerfile` now does `COPY requirements.txt` + `pip install -r requirements.txt` instead of an unpinned `pip install fastapi uvicorn httpx`, and the nightly installs from the same file on Python 3.11 (the base image's version). Why: the nightly must test the exact versions the image ships; before, the two install paths could drift. `DependencyPinTests` in `test_ollama_proxy.py` guards it.
- **`docs/DEVELOPMENT.md`:** nightly tier, browser E2E = hub `e2e-army`, test policy, and the table mapping each removed or trimmed spec to its e2e-army test.

### Numbers (measured on this head)

|                                                   | base (master) | head                     |
| ------------------------------------------------- | ------------- | ------------------------ |
| Web spec files (`git ls-files apps/web`)          | 48            | 43                       |
| Tests in the 14 touched web specs (jest `--json`) | 123           | 41                       |
| Spec LOC in those 14 files (`git diff --numstat`) |               | +8 / −1,223 (net −1,215) |
| Whole PR (19 files)                               |               | +193 / −1,231            |

API unit tests are untouched. The whole-suite web test total was not re-run locally (CI runs it); the old "48 → 29 suites / 458 → 284 tests / −3,636 LOC" figures described the earlier, wider draft and are withdrawn.

## Verification report

| AC  | Criterion                                                                               | Evidence (head `11387c2`)                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | The 5 removed specs are the only deleted files; PR text lists exactly the touched specs | `git diff --name-status origin/master...HEAD`: 5 `D`, 9 `M` spec files; `git ls-files apps/web \| grep -cE '\.spec\.tsx?$'` = 43 (master: 48)                                                                                                                                    |
| AC2 | The 9 trimmed web specs pass                                                            | `cd apps/web && npx jest --maxWorkers=2 --testPathPattern=<9 files>`: exit 0, 9 suites / 41 tests passed                                                                                                                                                                         |
| AC3 | Test-count change stated from a measurement                                             | same 14 files on master: 14 suites / 123 tests passed; head: 41 tests (−82)                                                                                                                                                                                                      |
| AC4 | ollama-proxy image and nightly install the same pinned versions                         | `DependencyPinTests` (3 tests, `test_ollama_proxy.py`): pass on head; `test_dockerfile_installs_from_requirements_file` fails against master's `Dockerfile` (run with `fastapi`/`httpx` import stubs, because they are not installed on this Mac and the sandbox has no network) |
| AC5 | Every nightly job `timeout-minutes: 5`, no `continue-on-error`                          | `.github/workflows/nightly.yml:33,100`                                                                                                                                                                                                                                           |
| AC6 | A nightly run shows 203 API e2e tests                                                   | **not met:** no `workflow_dispatch` run exists for this branch; run `gh workflow run nightly.yml --ref chore/slim-mz-tests` and record per-shard durations here                                                                                                                  |
| AC7 | UI / Playwright / RTL                                                                   | n/a: tests, docs and CI only; no UI file changed                                                                                                                                                                                                                                 |

Not verified: that `fastapi==0.143.0` / `uvicorn==0.54.0` install from PyPI (no network here); the first nightly run will show it.
