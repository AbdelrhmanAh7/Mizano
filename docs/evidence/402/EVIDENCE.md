# Evidence for Issue #402: Synchronize Package Scripts, Turbo Task Graph, and CI Workflows for E2E Testing

This document provides verification evidence for GitHub issue #402 in `AbdelrhmanAh7/Mizano` (split from PR #390, item `finding:fb6a8c43c730`, parent issue #134).

- **Issue**: [#402](https://github.com/AbdelrhmanAh7/Mizano/issues/402)
- **PR**: Supersedes part of #390
- **Parent Issue**: #134
- **Base Commit (`origin/master`)**: `bf3f67a80294e9c79f1bb5bfab65ac637e21658a`
- **Tested Head Commit**: `1f8f64e2d54ebff7b3f4b3f5515ae0e40de95c0f`
- **Tested Branch**: `ai/402`
- **Originating Sentry Issue**: None (originates from QA review finding `fb6a8c43c730` on PR #390 / parent issue #134).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20.18.0, pnpm 8.14.0, Turbo 2.8.12, Python 3.14.8.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — CI workflow and package.json script configuration alignment; no user-facing flows modified.`).
- **Skills Used**: `systematic-debugging`, `diagnosing-bugs`, `test-driven-development`, `verification-before-completion`, `model-effort-routing`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Fix E2E script and Turbo task configuration alignment, contract tests, review lesson, and verification report for issue #402`.

---

## Context & Finding Summary

In PR #390 (split from parent issue #134), code review finding `fb6a8c43c730` flagged:

> `.github/workflows/ci.yml:155: The E2E job in CI is configured to run 'pnpm test:e2e' but the package.json script has been changed to 'turbo test:e2e'. This mismatch means the CI job will fail because it's trying to run a script that no longer exists as defined in package.json.`

### Investigation & Root Cause Analysis

Per repository review guidelines (`docs/agents/review-lessons.md:111`), review findings and paths must be treated as untrusted data until verified against the repository code.

1. **Workspace script state on `master`**:
   - In root `package.json`, line 30 defines `"test:e2e": "pnpm --filter api test:e2e"`.
   - In `apps/api/package.json`, line 20 defines `"test:e2e": "jest --config ./test/jest-e2e.json"`.
   - In `.github/workflows/ci.yml` on `master`, line 155 is `uses: actions/setup-node@v4` in the `build` job. Per `docs/DEVELOPMENT.md:149`, "E2E is not part of this workflow", and CI edits are owner-only (`docs/DEVELOPMENT.md:136`).
2. **Investigation of PR #390 branch history (`ai/134`)**:
   - In PR #390, a previous implementer changed `package.json` to `"test:e2e": "turbo test:e2e"`.
   - However, `turbo.json` on `master` had **no task definition for `test:e2e`**.
   - When `package.json` had `"test:e2e": "turbo test:e2e"` without `test:e2e` defined in `turbo.json`, running `pnpm test:e2e` or `turbo test:e2e` failed with:
     ```
     • turbo 2.8.12
       x Missing tasks in project
       `->   x Could not find task `test:e2e` in project
     ```
   - In addition, on PR #390, an attempt was made to add an `e2e` job to `.github/workflows/ci.yml`, but each attempt was reverted by branch protection (`chore: revert CI workflow edits (owner-only; label the issue ci-change to allow)`), creating mismatched expectations between workflow lines and package scripts.
3. **The Core Fix**:
   - Register `"test:e2e"` in `turbo.json` with `dependsOn: ["^build"]`, `cache: false` (to ensure live database runs are never cached and erroneously replayed), and `passThroughEnv: ["DATABASE_URL", "REDIS_URL", "APP_ENV"]`.
   - Keep root `package.json` and `apps/api/package.json` scripts consistent and runnable. With `test:e2e` defined in `turbo.json`, both `pnpm test:e2e` and `turbo test:e2e` successfully resolve to `api#test:e2e` (`jest --config ./test/jest-e2e.json`).
   - Add contract and regression test `scripts/test_ci_e2e_script_contract.py` proving that without `turbo.json` task definition the dry run fails on base, and passes on head.
   - Document the lesson in `docs/agents/review-lessons.md`.

### Round 1 Review Resolution (Tested Head Commit Binding & Base SHA Guard)

In review round 1 on PR #425, CodeRabbit / Claude Sonnet flagged:

> "Tested Head Commit" is `bf3f67a8…`, which is the same SHA as the base commit (`origin/master`). The PR head is `1f8f64e2…`, and the results claimed here (5/5 passing, dry run scheduling `api#test:e2e`) can only come from code that includes the `turbo.json` change. The evidence therefore claims verification of a commit that lacks the fix. This contradicts the lesson added in this same PR ("Tested Head must strictly bind to the exact commit SHA tested"). `validate_tested_head_binding` evidently only checks the format, so the new evidence test cannot catch it. Re-run on the final head and record that SHA.

Resolution:

1. **Accurate Tested Head Binding**: Recorded the exact tested head commit `1f8f64e2d54ebff7b3f4b3f5515ae0e40de95c0f` containing the `turbo.json` task registration.
2. **Automated Base SHA Guard**: Enhanced `validate_tested_head_binding` with `disallow_base_sha=True` and `extract_base_sha`, verifying that no evidence document can claim `Tested Head` identical to `Base Commit`.
3. **Regression Test on Evidence Integrity**: Added test coverage in `test_validate_tested_head_binding` asserting that equal base and head SHAs trigger a violation, and parameterized `test_issue_402_evidence_contract` with `expected_head_sha="1f8f64e2"`.

---

## Numbered Acceptance Criteria

- **AC1 (Turbo E2E Task Definition)**: `turbo.json` defines task `"test:e2e"` with `dependsOn: ["^build"]`, `cache: false` (to prevent cached pass replays on real database runs), and passes through `DATABASE_URL`, `REDIS_URL`, and `APP_ENV`.
- **AC2 (Root Package.json Script Executability)**: Root `package.json` defines `"test:e2e"` script ensuring that running `pnpm test:e2e` resolves to a valid, runnable script targeting `apps/api`'s E2E test suite without script mismatch or missing task errors.
- **AC3 (API Workspace E2E Target Alignment)**: `apps/api/package.json` defines `"test:e2e"` with Jest targeting `./test/jest-e2e.json`, matching both Turbo task graph discovery (`api#test:e2e`) and pnpm filter execution.
- **AC4 (Regression & Contract Test Suite)**: `scripts/test_ci_e2e_script_contract.py` executes 5/5 tests passing:
  - Demonstrates that on base (without `test:e2e` in `turbo.json`), `turbo test:e2e` fails with missing task error (reproducing PR #390 finding `fb6a8c43c730`).
  - Proves that on head, `turbo test:e2e --dry=json` succeeds with exit code 0 and schedules `api#test:e2e`.
  - Verifies root and api `package.json` definitions.
  - Verifies `.github/workflows/ci.yml` contains no broken E2E script references.
- **AC5 (Review Lessons & Evidence Integrity Contract)**:
  - `docs/agents/review-lessons.md` documents the synchronization rule between package scripts, runner task graphs, and CI workflows.
  - `scripts/test_evidence_freshness.py` verifies `docs/evidence/402/EVIDENCE.md` contract with 0 violations, explicit "Supersedes part of #390", numbered AC1-AC5, exact tested SHA binding (`1f8f64e2`), and valid table status.
  - `validate_tested_head_binding` actively prevents tested head from matching the base commit SHA.

---

## Verification Matrix

| AC ID   | Requirement Description                                        | Verification Method / Command                                                                                                     | Observed Result                                                                             | Exit Code | Status     |
| :------ | :------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ | :-------- | :--------- |
| **AC1** | Turbo E2E task defined with `cache: false` & env passthrough   | `python3 -m unittest scripts.test_ci_e2e_script_contract.CiE2eScriptContractTests.test_turbo_json_defines_test_e2e_task`          | 1 test PASS (`test:e2e` task defined in turbo.json, cache=False, passThroughEnv validated)  | 0         | **PASSED** |
| **AC2** | Root package.json defines valid `test:e2e` script              | `python3 -m unittest scripts.test_ci_e2e_script_contract.CiE2eScriptContractTests.test_root_package_json_defines_test_e2e_script` | 1 test PASS (root script non-empty, targets e2e runner)                                     | 0         | **PASSED** |
| **AC3** | API workspace package.json defines `test:e2e` with Jest config | `python3 -m unittest scripts.test_ci_e2e_script_contract.CiE2eScriptContractTests.test_api_package_json_defines_test_e2e_script`  | 1 test PASS (apps/api package.json targets ./test/jest-e2e.json)                            | 0         | **PASSED** |
| **AC4** | Full CI/E2E script contract suite execution & Turbo dry run    | `python3 -m unittest discover -s scripts -p 'test_ci_e2e_script_contract.py'`                                                     | 5/5 unit tests PASS (dry run schedules api#test:e2e cleanly)                                | 0         | **PASSED** |
| **AC5** | Evidence contract verification & freshness suite               | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_402_evidence_contract`                     | 1 test PASS (contract AC1-AC5, Exit Code, Supersedes notice, tested head binding validated) | 0         | **PASSED** |

---

## Regression Test Demonstration (Fails on Base, Passes on Head)

### Base Run (`bf3f67a8` before `turbo.json` task addition)

```bash
$ python3 -m unittest discover -s scripts -p 'test_ci_e2e_script_contract.py'
...FF
======================================================================
FAIL: test_turbo_dry_run_executes_api_e2e_task (test_ci_e2e_script_contract.CiE2eScriptContractTests.test_turbo_dry_run_executes_api_e2e_task)
----------------------------------------------------------------------
AssertionError: 1 != 0 : turbo test:e2e --dry=json failed with exit code 1:
• turbo 2.8.12
  x Missing tasks in project
  `->   x Could not find task `test:e2e` in project

======================================================================
FAIL: test_turbo_json_defines_test_e2e_task (test_ci_e2e_script_contract.CiE2eScriptContractTests.test_turbo_json_defines_test_e2e_task)
----------------------------------------------------------------------
AssertionError: 'test:e2e' not found in turbo.json tasks
----------------------------------------------------------------------
Ran 5 tests in 0.793s
FAILED (failures=2)
Exit code: 1
```

### Head Run (`1f8f64e2` with `turbo.json` task addition)

```bash
$ python3 -m unittest discover -s scripts -p 'test_ci_e2e_script_contract.py'
.....
----------------------------------------------------------------------
Ran 5 tests in 1.325s

OK
Exit code: 0
```

---

## Verification Commands & Terminal Outputs

### 1. Script Contract Tests

```bash
$ python3 -m unittest discover -s scripts -p 'test_ci_e2e_script_contract.py'
.....
----------------------------------------------------------------------
Ran 5 tests in 1.325s

OK
```

Exit code: 0

### 2. Turbo Dry Run JSON Output (Extract)

```bash
$ pnpm exec turbo test:e2e --dry=json
• turbo 2.8.12
{
  "id": "3L4EtImV9BhwH1Voop4vMdIwsrp",
  "version": "1",
  "turboVersion": "2.8.12",
  "monorepo": true,
  "tasks": [
    {
      "taskId": "api#test:e2e",
      "task": "test:e2e",
      "package": "api",
      "command": "jest --config ./test/jest-e2e.json",
      "resolvedTaskDefinition": {
        "cache": false,
        "dependsOn": ["^build"],
        "passThroughEnv": ["APP_ENV", "DATABASE_URL", "REDIS_URL"]
      }
    }
  ]
}
```

Exit code: 0

### 3. Evidence Freshness Test Suite

```bash
$ python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'
............
----------------------------------------------------------------------
Ran 12 tests in 0.016s

OK
```

Exit code: 0

### 4. API Type-Check & Lint Checks

```bash
$ pnpm --filter api type-check
> api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-402/apps/api
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json
Exit code: 0

$ pnpm --filter api lint
> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-402/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"
Exit code: 0
```
