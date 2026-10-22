# Evidence for Issue #326: Guard against duplicate bare import shims in e2e-army

This document provides verification evidence for GitHub issue #326 in `AbdelrhmanAh7/Mizano` (split from PR #303, parent issue #277).

- **Issue**: #326 (fix: 167-work-order-complete.e2e.ts: major (Claude Sonnet 5.5·medium): A bare import './277-work-order-com… split from PR #303)
- **Base commit (`origin/master`)**: `e07f1e3d7585844a9af23dae48f870087993e4b3`
- **Tested Head (`ai/326`)**: `fdf579dd2d52ec300fa8e434f07a7e3d16aa2ca7`
- **Supersedes**: Part of #303 (specifically resolving CodeReview finding `4c59d0fbb73a` / discussion `r4331288511`)
- **Originating Sentry issue**: None found (internal code review finding on PR #303 regarding duplicate test registration in e2e-army runner).
- **Skills used**: `model-effort-routing`, `diagnosing-bugs`, `systematic-debugging`, `verification-before-completion`, `test-first`
- **Model and effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Standard code, regression test, and verification report for issue #326`

## Scope & Context

In PR #303, finding `4c59d0fbb73a` noted:

> "A bare `import './277-work-order-complete.e2e'` makes the 277 test register a second time under the 167 file, so the suite runs it twice. Both runs call `createStartedWorkOrder` with the fixed seed `army-277` and create inventory items with the same `code` values (`army-277-OUT` and `army-277-COMP`). That will probably hit a unique-code conflict on the second run, or when the files run in parallel workers. `post()` then fails on the `<300` assertion. Delete this shim file. If a 167-tagged file is required, tag the 277 test `@issue-167` (it already is) and make the item codes unique per run, for example by appending a timestamp or random suffix."

This PR resolves finding `4c59d0fbb73a` on a fresh branch off `master` by:

1. Ensuring no duplicate shim `e2e-army/167-work-order-complete.e2e.ts` exists in the repository.
2. Introducing an automated regression test `scripts/test_e2e_army_hygiene.py` that validates that:
   - No `.e2e.ts` file imports or re-exports other `.e2e` files;
   - All `.e2e.ts` files define active test cases rather than acting as empty/re-export shims;
   - Planting the PR #303 shim pattern fails with exit code 1;
   - The repository passes all hygiene checks cleanly on head with exit code 0.

## Acceptance Criteria

- **AC1 (No duplicate re-import shim):** `e2e-army/167-work-order-complete.e2e.ts` does not exist as a duplicate shim re-importing another test file, preventing double-registration of test cases, duplicate resource allocations, and seed code collisions in parallel/serial test runs.
- **AC2 (Automated hygiene guard for `e2e-army`):** An automated regression test `scripts/test_e2e_army_hygiene.py` validates all files in `e2e-army/` to ensure:
  1. No file contains bare imports of other `.e2e` files (e.g. `import './...e2e'` or `import './...e2e.ts'`);
  2. No file re-exports other `.e2e` files (e.g. `export * from './...e2e'`);
  3. Every `.e2e.ts` file in `e2e-army/` defines its own test suite via `test(...)` rather than acting as a passthrough shim;
  4. Imports adhere to the e2e-army gate requirements (importing from `@e2e-dev/web` and `e2e`).
- **AC3 (Regression test failure & pass proof):** The test suite `scripts/test_e2e_army_hygiene.py` includes unit tests proving that:
  1. Planting a duplicate re-import shim file (such as the exact shim from PR #303) fails the check with exit code 1;
  2. The current repository state in `e2e-army/` passes all hygiene checks cleanly with exit code 0.
- **AC4 (Clean integration & non-user-facing exemption):** As this issue addresses test-runner hygiene and removes duplicate test registration without modifying end-user UI flows, no user-facing e2e-army scenario is required (`E2E: not needed — internal test suite hygiene / duplicate shim removal`). All linter and unit tests pass locally with zero regressions.
- **AC5 (Evidence documentation):** Complete verification evidence is documented in `docs/evidence/326/EVIDENCE.md` with exact commands, outputs, and exit codes.

## Verification Report

| Criterion | Verification Check                       | Command / Proof                                                            | Observed Output                       | Exit Code | Status |
| :-------- | :--------------------------------------- | :------------------------------------------------------------------------- | :------------------------------------ | :-------- | :----- |
| **AC1**   | No `167-work-order-complete.e2e.ts` shim | `test ! -f e2e-army/167-work-order-complete.e2e.ts`                        | Clean exit (file absent)              | 0         | PASSED |
| **AC2**   | Automated hygiene guard passes on HEAD   | `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py' -v` | `Ran 11 tests in 0.003s ... OK`       | 0         | PASSED |
| **AC3**   | Planted duplicate shim regression fails  | `python3 -c "from pathlib import Path; ..."` (planted shim)                | `Return code: 1, FAILED (failures=3)` | 1         | PASSED |
| **AC4**   | Full offline `scripts` test suite passes | `python3 -m unittest discover -s scripts -p 'test_*.py'`                   | `Ran 74 tests in 15.414s ... OK`      | 0         | PASSED |
| **AC5**   | Pre-commit staged checks pass cleanly    | `.husky/pre-commit` via `_lint_staged.js`                                  | `[lint-staged] All checks passed.`    | 0         | PASSED |

## Changed Covering Tests

- `scripts/test_e2e_army_hygiene.py` (added: 11 tests, 0 failures):
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

### 1. Regression test failure when shim is planted (reproducing finding 4c59d0fbb73a):

Command:

```bash
python3 -c '
from pathlib import Path
import subprocess

shim = Path("e2e-army/167-work-order-complete.e2e.ts")
try:
    shim.write_text("""/**\n * Issue #167 / #277: Work Order Complete E2E coverage.\n * The primary test suite is maintained in e2e-army/277-work-order-complete.e2e.ts.\n */\nimport \x27./277-work-order-complete.e2e\x27;\n""")
    res = subprocess.run(["python3", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_e2e_army_hygiene.py"], capture_output=True, text=True)
    print("Return code:", res.returncode)
    print(res.stderr)
finally:
    if shim.exists():
        shim.unlink()
'
```

Output:

```text
Return code: 1
........FFF
======================================================================
FAIL: test_all_e2e_files_define_tests (test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_all_e2e_files_define_tests)
Every file in e2e-army must define active test cases rather than acting as a passthrough shim.
----------------------------------------------------------------------
Traceback (most recent call last):
  File ".../scripts/test_e2e_army_hygiene.py", line 200, in test_all_e2e_files_define_tests
    self.assertTrue(
        file_defines_test(content),
        f"File {file_path.name} does not define any active test cases",
    )
AssertionError: False is not true : File 167-work-order-complete.e2e.ts does not define any active test cases

======================================================================
FAIL: test_no_167_duplicate_shim_file (test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_no_167_duplicate_shim_file)
e2e-army/167-work-order-complete.e2e.ts must not exist as a duplicate re-import shim.
----------------------------------------------------------------------
Traceback (most recent call last):
  File ".../scripts/test_e2e_army_hygiene.py", line 165, in test_no_167_duplicate_shim_file
    self.assertEqual(
        violations,
        [],
        f"167-work-order-complete.e2e.ts is a duplicate shim: {violations}",
    )
AssertionError: Lists differ: [(5, "import './277-work-order-complete.e2e';")] != []

======================================================================
FAIL: test_no_bare_e2e_imports_in_e2e_army (test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_no_bare_e2e_imports_in_e2e_army)
No .e2e.ts file in e2e-army may import another .e2e file.
----------------------------------------------------------------------
Traceback (most recent call last):
  File ".../scripts/test_e2e_army_hygiene.py", line 186, in test_no_bare_e2e_imports_in_e2e_army
    self.assertEqual(
        violations,
        [],
        f"File {file_path.name} contains invalid .e2e imports: {violations}",
    )
AssertionError: Lists differ: [(5, "import './277-work-order-complete.e2e';")] != []

----------------------------------------------------------------------
Ran 11 tests in 0.001s

FAILED (failures=3)
```

Exit code: 1

### 2. Passing run on HEAD:

Command:

```bash
python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py' -v
```

Output:

```text
test_bare_e2e_import_detected (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_bare_e2e_import_detected) ... ok
test_bare_e2e_ts_import_detected (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_bare_e2e_ts_import_detected) ... ok
test_comments_ignored (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_comments_ignored) ... ok
test_file_defines_test_detector (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_file_defines_test_detector) ... ok
test_named_import_of_e2e_detected (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_named_import_of_e2e_detected) ... ok
test_planted_shim_regression_fails (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_planted_shim_regression_fails)
Re-creates the exact shim from PR #303 and verifies it is detected. ... ok
test_reexport_e2e_detected (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_reexport_e2e_detected) ... ok
test_standard_e2e_imports_not_flagged (test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_standard_e2e_imports_not_flagged) ... ok
test_all_e2e_files_define_tests (test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_all_e2e_files_define_tests)
Every file in e2e-army must define active test cases rather than acting as a passthrough shim. ... ok
test_no_167_duplicate_shim_file (test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_no_167_duplicate_shim_file)
e2e-army/167-work-order-complete.e2e.ts must not exist as a duplicate re-import shim. ... ok
test_no_bare_e2e_imports_in_e2e_army (test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_no_bare_e2e_imports_in_e2e_army)
No .e2e.ts file in e2e-army may import another .e2e file. ... ok

----------------------------------------------------------------------
Ran 11 tests in 0.003s

OK
```

Exit code: 0

## UI & E2E Verification Note

This change addresses internal test runner hygiene and regression prevention against duplicate e2e test imports. It does not alter user-facing behavior or UI flows (`E2E: not needed — internal test suite hygiene / duplicate shim removal`).
