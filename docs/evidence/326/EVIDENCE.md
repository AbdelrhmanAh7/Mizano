# Evidence for Issue #326: Guard against duplicate bare import shims in e2e-army

This document provides verification evidence for GitHub issue #326 in `AbdelrhmanAh7/Mizano` (split from PR #303, parent issue #277).

- **Issue**: #326 (fix: 167-work-order-complete.e2e.ts: major (Claude Sonnet 5.5·medium): A bare import './277-work-order-com… split from PR #303)
- **Base commit (`origin/master`)**: `e07f1e3d7585844a9af23dae48f870087993e4b3`
- **Tested Code Commit (`ai/326`)**: `fdf579dd2d52ec300fa8e434f07a7e3d16aa2ca7`
- **Supersedes**: Part of #303 (specifically resolving CodeReview finding `4c59d0fbb73a` / discussion `r4331288511`)
- **Originating Sentry issue**: None found (internal code review finding on PR #303 regarding duplicate test registration in e2e-army runner).
- **Skills used**: `model-effort-routing`, `diagnosing-bugs`, `systematic-debugging`, `verification-before-completion`, `test-first`
- **Model and effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Standard code, regression test, and verification report for issue #326`

## Scope & Context

In PR #303, finding `4c59d0fbb73a` noted:

> "A bare `import './277-work-order-complete.e2e'` makes the 277 test register a second time under the 167 file, so the suite runs it twice. Both runs call `createStartedWorkOrder` with the fixed seed `army-277` and create inventory items with the same `code` values (`army-277-OUT` and `army-277-COMP`). That will probably hit a unique-code conflict on the second run, or when the files run in parallel workers. `post()` then fails on the `<300` assertion. Delete this shim file. If a 167-tagged file is required, tag the 277 test `@issue-167` (it already is) and make the item codes unique per run, for example by appending a timestamp or random suffix."

This PR resolves finding `4c59d0fbb73a` on a fresh branch off `master` by:

1. Ensuring no duplicate shim `e2e-army/167-work-order-complete.e2e.ts` exists in the repository;
2. Introducing an automated regression test `scripts/test_e2e_army_hygiene.py` validating that no `.e2e.ts` file imports other `.e2e` files, every `.e2e.ts` file defines its own active test cases, and duplicate shims fail the gate.

## Acceptance Criteria

- **AC1 (No duplicate re-import shim):** `e2e-army/167-work-order-complete.e2e.ts` does not exist as a duplicate shim re-importing another test file, preventing double-registration of test cases, duplicate resource allocations, and seed code collisions.
- **AC2 (Automated hygiene guard for `e2e-army`):** An automated regression test `scripts/test_e2e_army_hygiene.py` validates that no file in `e2e-army/` contains bare imports or re-exports of other `.e2e` files, and every `.e2e.ts` file defines active test cases.
- **AC3 (Regression test failure & pass proof):** Planting a duplicate re-import shim fails the check with exit code 1; the repository passes cleanly on head with exit code 0.
- **AC4 (Clean integration & non-user-facing exemption):** Internal test suite hygiene / duplicate shim removal; no user-facing UI change (`E2E: not needed — internal test suite hygiene / duplicate shim removal`).
- **AC5 (Evidence documentation):** Complete verification evidence is documented in `docs/evidence/326/EVIDENCE.md` with exact commands and exit codes.

## Verification Report

| Criterion | Verification Check                       | Command / Proof                                                            | Observed Output                       | Exit Code | Status |
| :-------- | :--------------------------------------- | :------------------------------------------------------------------------- | :------------------------------------ | :-------- | :----- |
| **AC1**   | No `167-work-order-complete.e2e.ts` shim | `test ! -f e2e-army/167-work-order-complete.e2e.ts`                        | Clean exit (file absent)              | 0         | PASSED |
| **AC2**   | Automated hygiene guard passes on HEAD   | `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py' -v` | `Ran 11 tests in 0.002s ... OK`       | 0         | PASSED |
| **AC3**   | Planted duplicate shim regression fails  | `python3 -c "from pathlib import Path; ..."` (planted shim)                | `Return code: 1, FAILED (failures=3)` | 1         | PASSED |
| **AC4**   | Full offline `scripts` test suite passes | `python3 -m unittest discover -s scripts -p 'test_*.py'`                   | `Ran 74 tests in 15.414s ... OK`      | 0         | PASSED |
| **AC5**   | Pre-commit staged checks pass cleanly    | `.husky/pre-commit` via `_lint_staged.js`                                  | `[lint-staged] All checks passed.`    | 0         | PASSED |

## Changed Covering Tests

- `scripts/test_e2e_army_hygiene.py` (11 tests, 0 failures):
  - `test_bare_e2e_import_detected`
  - `test_bare_e2e_ts_import_detected`
  - `test_reexport_e2e_detected`
  - `test_named_import_of_e2e_detected`
  - `test_standard_e2e_imports_not_flagged`
  - `test_comments_ignored`
  - `test_file_defines_test_detector`
  - `test_planted_shim_regression_fails`
  - `test_no_167_duplicate_shim_file`
  - `test_no_bare_e2e_imports_in_e2e_army`
  - `test_all_e2e_files_define_tests`

## Regression Proof (Bug fix: fails on planted violation, passes on HEAD)

### 1. Regression failure when shim is planted (reproducing finding 4c59d0fbb73a):

Command:

```bash
python3 -c '
from pathlib import Path; import subprocess
shim = Path("e2e-army/167-work-order-complete.e2e.ts")
try:
    shim.write_text("/**\n * Shim\n */\nimport \x27./277-work-order-complete.e2e\x27;\n")
    res = subprocess.run(["python3", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_e2e_army_hygiene.py"], capture_output=True, text=True)
    print("Return code:", res.returncode)
    print(res.stderr)
finally:
    if shim.exists(): shim.unlink()
'
```

Output:

```text
Return code: 1
........FFF
FAIL: test_all_e2e_files_define_tests: File 167-work-order-complete.e2e.ts does not define any active test cases
FAIL: test_no_167_duplicate_shim_file: 167-work-order-complete.e2e.ts is a duplicate shim: [(4, "import './277-work-order-complete.e2e';")]
FAIL: test_no_bare_e2e_imports_in_e2e_army: File 167-work-order-complete.e2e.ts contains invalid .e2e imports: [(4, "import './277-work-order-complete.e2e';")]
Ran 11 tests in 0.001s - FAILED (failures=3)
```

Exit code: 1

### 2. Passing run on HEAD:

Command:

```bash
python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py' -v
```

Output:

```text
Ran 11 tests in 0.002s - OK
```

Exit code: 0

## UI & E2E Verification Note

This change addresses internal test runner hygiene and regression prevention against duplicate e2e test imports. It does not alter user-facing behavior or UI flows (`E2E: not needed — internal test suite hygiene / duplicate shim removal`).
