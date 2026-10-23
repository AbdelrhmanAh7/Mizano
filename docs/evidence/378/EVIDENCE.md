# Evidence for Issue #378: Guard against hardcoded login credentials in e2e-army specs

This document provides verification evidence for GitHub issue #378 in `AbdelrhmanAh7/Mizano` (split from PR #340, item `finding:7921754e38c2`, parent issue #317).

- **Issue**: [#378](https://github.com/AbdelrhmanAh7/Mizano/issues/378)
- **PR**: Supersedes part of #340
- **Parent Issue**: #317
- **Base Commit (`origin/master`)**: `bf3f67a80294e9c79f1bb5bfab65ac637e21658a`
- **Tested Head Commit**: `737bd818`
- **Tested Branch**: `ai/378`
- **Originating Sentry Issue**: None (originates from review finding `7921754e38c2` / comment 6308811548 on PR #340 / parent issue #317).
- **Host Environment**: Darwin arm64 (macOS), Python 3.14.8, Node.js v20.18.0, pnpm 8.14.0.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — internal test suite hygiene / hardcoded credentials detection and prevention in e2e test files; no user-facing flows modified.`).
- **Skills Used**: `model-effort-routing`, `diagnosing-bugs`, `systematic-debugging`, `test-first`, `verification-before-completion`, `receiving-code-review`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Guard against hardcoded credentials in e2e-army specs, resolve PR #412 review findings, add comprehensive unit and repo-wide integration tests, and verification report for issue #378`.

---

## Context & Finding Summary

In PR #340 (split from parent issue #317: bill-form account and item options searchable and page-aware), code review finding `7921754e38c2` (comment 6308811548) flagged:

> `e2e-army/317-searchable-bill-options.e2e.ts:5-7 – hard‑coded login email and password expose sensitive credentials in the repository.`

### Round 2 Review Findings (Head `222870f`)

In Round 2 review, QA flagged three major recurring findings:

1. **`e2e-army/104-smtp-rotation-stamp.e2e.ts:35`** (Finding `757f82916c70`):
   > Default fallback credentials are still hard-coded in the environment variable fallback, which could expose credentials if process.env is not properly configured.
2. **`e2e-army/131-cross-tenant-delivery-challan.e2e.ts:7`** (Finding `0ae87e6ec076`):
   > Default fallback credentials are still hard-coded in the environment variable fallback, which could expose credentials if process.env is not properly configured.
3. **`e2e-army/207-currency-fx-tenant-and-idempotency.e2e.ts:6`** (Finding `5c041d8a5bd5`):
   > Default fallback credentials are still hard-coded in the environment variable fallback, which could expose credentials if process.env is not properly configured.

---

## Investigation & Root Cause

1. **The Fallback Obfuscation in E2E Specs**:
   - In head `222870f`, the three files utilized obfuscated fallback expressions:
     ```ts
     const loginEmail = process.env.E2E_LOGIN_EMAIL ?? ['admin', 'mizano.com'].join('@');
     const loginPassword = process.env.E2E_LOGIN_PASSWORD ?? ['password', '123'].join('');
     ```
   - Although disguised via array join syntax, this retained the exact hardcoded default credentials (`admin@mizano.com` / `password123`) as fallbacks whenever environment variables were omitted.
2. **The Detector Loophole in `scripts/test_e2e_army_hygiene.py`**:
   - The validation function `find_hardcoded_credential_violations` contained an early-exit check:
     ```python
     if "process.env" in code_part:
         continue
     ```
   - This skipped all subsequent credential checks on any line referencing `process.env`. As a result, hard-coded fallback credentials (such as `process.env.E2E_LOGIN_PASSWORD ?? 'password123'` or `?? ['password', '123'].join('')`) bypassed detection entirely.

---

## Resolution & Root Cause Fix

1. **Strict Credential Sourcing in E2E Specs (Zero Hardcoded Fallbacks)**:
   - **`e2e-army/104-smtp-rotation-stamp.e2e.ts:36-40`**:
     Removed default fallback credentials. Sourced directly from `process.env.E2E_LOGIN_EMAIL` and `process.env.E2E_LOGIN_PASSWORD`. Added runtime validation asserting both environment variables are set.
   - **`e2e-army/131-cross-tenant-delivery-challan.e2e.ts:8-9`**:
     Removed default fallback credentials. Defined `LOGIN` using direct `process.env` references.
   - **`e2e-army/207-currency-fx-tenant-and-idempotency.e2e.ts:7-8, 24-27`**:
     Removed default fallback credentials. Defined `ADMIN` using direct `process.env` references and added runtime validation in `signIn`.
   - **`e2e-army/317-searchable-bill-options.e2e.ts:7-9`** (NEW):
     Created the missing spec file with `LOGIN` credentials sourced exclusively from `process.env.E2E_LOGIN_EMAIL` and `process.env.E2E_LOGIN_PASSWORD` with runtime validation (no fallbacks). This resolves the original PR #340 finding `7921754e38c2` for this file.
2. **Hardened Detection Tooling in `scripts/test_e2e_army_hygiene.py`**:
   - Added `OBFUSCATED_JOIN_CREDENTIAL_PATTERN` to flag joined array tricks like `['admin', 'mizano.com'].join` and `['password', '123'].join`.
   - Added `ENV_CREDENTIAL_FALLBACK_PATTERN` to flag non-empty string literals and join expressions provided as `??` or `||` fallbacks in credential lookups.
   - **Fixed detector loophole**: Replaced the blanket `if "process.env" in code_part: continue` with per-assignment checking in `find_hardcoded_credential_violations`. Now each `pw:`/`password:` assignment is evaluated individually — assignments using `process.env` are compliant, while hardcoded string/template literals on the same line are flagged.
3. **Comprehensive Unit & Integration Regression Tests (`scripts/test_e2e_army_hygiene.py`)**:
   - `test_env_fallback_with_obfuscated_join_detected`: Verifies detection of `['admin', 'mizano.com'].join('@')` and `['password', '123'].join('')` in `process.env` fallbacks.
   - `test_env_fallback_with_hardcoded_password_detected`: Verifies detection of `password123` literals in `process.env` fallbacks.
   - `test_env_fallback_with_arbitrary_string_password_detected`: Verifies detection of arbitrary password strings in `??` and `||` fallbacks.
   - `test_no_hardcoded_credential_fallbacks_in_e2e_army`: Integration test scanning all `*.e2e.ts` files in `e2e-army/` to guarantee zero fallback credentials or obfuscated joins exist.
   - `test_sanitized_credentials_accepted`: Updated to assert that pure environment variable sourcing (without fallbacks) passes cleanly.
   - **NEW** `test_mixed_process_env_and_hardcoded_on_same_line_detected`: Verifies that hardcoded `pw:`/`password:` assignments mixed with `process.env` assignments on the same line are detected.
   - **NEW** `test_process_env_assignments_not_flagged`: Verifies that `pw:`/`password:` assignments using `process.env` are not flagged even when on the same line.
   - **UPDATED** `test_317_e2e_no_hardcoded_credentials`: Now requires the 317 spec file to exist and validates it contains no hardcoded credentials.
4. **Updated Review Lessons (`docs/agents/review-lessons.md:89`)**:
   - Explicitly updated the rule to forbid default fallback credentials in environment variable lookups.

---

## Numbered Acceptance Criteria

- **AC1 (Review Lessons Rule)**: Document the explicit security hygiene rule in `docs/agents/review-lessons.md` forbidding hardcoded sensitive credentials, plaintext passwords, or default fallback credentials in e2e tests or fixtures, and mandating dynamic sourcing (`process.env.E2E_LOGIN_EMAIL`, `process.env.E2E_LOGIN_PASSWORD`) without fallback joins or literals.
- **AC2 (Credential Violation Detection Tooling)**: Implement generalised `find_hardcoded_credential_violations` in `scripts/test_e2e_army_hygiene.py` to scan code for hardcoded credentials (plaintext passwords and sensitive login emails in quotes or backticks, obfuscated join expressions, default fallback credentials in `process.env` lookups, as well as `pw`/`password` property assignments without `process.env`) while ignoring comments.
- **AC3 (Hygiene Unit Regression Tests)**: Provide comprehensive unit regression tests in `scripts/test_e2e_army_hygiene.py` verifying detection of:
  1. The PR #340 finding `7921754e38c2` snippet with hardcoded email and password;
  2. Template literals with backticks;
  3. Arbitrary hardcoded passwords assigned in login/admin objects or params;
  4. Obfuscated joined credentials (`['admin', 'mizano.com'].join('@')` / `['password', '123'].join('')`);
  5. Default fallback credentials in `process.env` lookups (`?? 'password123'`, `?? 'arbitrarySecret'`, `|| '...'`);
  6. Planted 317 test code regression;
  7. Sanitized dynamic credentials from environment variables without fallbacks passing cleanly.
  8. **Hardcoded `pw:`/`password:` assignments mixed with `process.env` on same line are detected** (NEW).
  9. **Pure `process.env` assignments for `pw:`/`password:` on same line are NOT flagged** (NEW).
- **AC4 (Repository-wide E2E Integration Hygiene Check)**: `test_no_hardcoded_credentials_in_e2e_army`, `test_no_hardcoded_credential_fallbacks_in_e2e_army`, and `test_e2e_login_specs_source_credentials_from_env` in `scripts/test_e2e_army_hygiene.py` verify that all `*.e2e.ts` files in `e2e-army/` contain zero hardcoded credentials, zero default credential fallbacks, and specs that log in source credentials via `process.env`.
- **AC5 (Automated Evidence & Contract Verification)**: `docs/evidence/378/EVIDENCE.md` documents all criteria, exit codes, exact tested head binding, and supersedes notice, verified by `test_issue_378_evidence_contract` in `scripts/test_evidence_freshness.py`.
- **AC6 (317 Searchable Bill Options Spec)**: `e2e-army/317-searchable-bill-options.e2e.ts` exists, defines active tests for bill-form searchable options (AC1-AC4, AC6 from issue #317), sources credentials via `process.env` without fallbacks, and passes `test_317_e2e_no_hardcoded_credentials`.

---

## Verification Matrix

| AC ID   | Requirement Description                                          | Verification Method / Command                                                                                                                 | Observed Result                                                                             | Exit Code | Status     |
| :------ | :--------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ | :-------- | :--------- |
| **AC1** | Document hardcoded credentials hygiene rule in review lessons    | `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py'`                                                                       | Rule verified in `docs/agents/review-lessons.md`, 26 tests PASS                             | 0         | **PASSED** |
| **AC2** | Implement generalised credential violation detector              | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_hardcoded_credentials_in_317_snippet_detected`         | 1 test PASS (`find_hardcoded_credential_violations` successfully detects violation)         | 0         | **PASSED** |
| **AC3** | Comprehensive unit regression tests for detection & sanitization | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_planted_317_hardcoded_credentials_regression_fails`    | 1 test PASS (planted code detected at line 5 with exit code 0)                              | 0         | **PASSED** |
| **AC3** | Mixed process.env/hardcoded detection                            | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_mixed_process_env_and_hardcoded_on_same_line_detected` | 1 test PASS (hardcoded pw on same line as process.env detected)                             | 0         | **PASSED** |
| **AC3** | Pure process.env assignments not flagged                         | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_process_env_assignments_not_flagged`                   | 1 test PASS (process.env assignments on same line not flagged)                              | 0         | **PASSED** |
| **AC4** | Repository-wide e2e hygiene integration check                    | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_no_hardcoded_credentials_in_e2e_army`                   | 1 test PASS (all e2e-army specs verified clean of hardcoded credentials and fallbacks)      | 0         | **PASSED** |
| **AC5** | Evidence contract verification                                   | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_378_evidence_contract`                                 | 1 test PASS (contract AC1-AC6, Exit Code, Supersedes notice, tested head binding validated) | 0         | **PASSED** |
| **AC6** | 317 searchable bill options spec exists and is sanitized         | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_317_e2e_no_hardcoded_credentials`                       | 1 test PASS (317 spec exists, no hardcoded credentials, uses process.env)                   | 0         | **PASSED** |

---

## Changed Covering Tests

- `scripts/test_e2e_army_hygiene.py`:
  - `test_hardcoded_credentials_in_317_snippet_detected`
  - `test_hardcoded_credentials_template_literal_detected`
  - `test_arbitrary_hardcoded_password_literal_detected`
  - `test_hardcoded_email_detected`
  - `test_env_fallback_with_obfuscated_join_detected`
  - `test_env_fallback_with_hardcoded_password_detected`
  - `test_env_fallback_with_arbitrary_string_password_detected`
  - `test_sanitized_credentials_accepted`
  - `test_planted_317_hardcoded_credentials_regression_fails`
  - `test_mixed_process_env_and_hardcoded_on_same_line_detected` (NEW)
  - `test_process_env_assignments_not_flagged` (NEW)
  - `test_no_hardcoded_credentials_in_e2e_army`
  - `test_no_hardcoded_credential_fallbacks_in_e2e_army`
  - `test_e2e_login_specs_source_credentials_from_env`
  - `test_317_e2e_no_hardcoded_credentials` (UPDATED: now requires file existence)
- `scripts/test_evidence_freshness.py`:
  - `test_issue_378_evidence_contract`
- `e2e-army/317-searchable-bill-options.e2e.ts` (NEW):
  - Two test cases for bill-form searchable options (EN/LTR and AR/RTL)

---

## Bug Fix / Regression Demonstration

### Base Behaviour (commit `bf3f67a80294e9c79f1bb5bfab65ac637e21658a` & round 2 finding `222870fa`)

1. On `origin/master`:
   - `find_hardcoded_credential_violations` did not exist in `scripts/test_e2e_army_hygiene.py`.
   - Hardcoded plaintext credentials such as `const LOGIN = { email: 'admin@mizano.com', pw: 'password123' };` in e2e tests went completely undetected by automated repository test hygiene checks.
   - `test_issue_378_evidence_contract` failed because `docs/evidence/378/EVIDENCE.md` was missing.
   - The file `e2e-army/317-searchable-bill-options.e2e.ts` did not exist on master; the original hardcoded version (commit `ce1bc460`) existed only on branch `ai/317`.
2. On commit `222870fa`:
   - Hardcoded fallback credentials using obfuscated joins (`['admin', 'mizano.com'].join('@')` / `['password', '123'].join('')`) in `104-smtp-rotation-stamp.e2e.ts`, `131-cross-tenant-delivery-challan.e2e.ts`, and `207-currency-fx-tenant-and-idempotency.e2e.ts` bypassed detection due to `if "process.env" in code_part: continue`.
   - When the detector was hardened to catch fallbacks, the regression test reproduced and failed:
     ```text
     FAIL: test_no_hardcoded_credential_fallbacks_in_e2e_army (scripts.test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_no_hardcoded_credential_fallbacks_in_e2e_army)
     AssertionError: True is not false : File 104-smtp-rotation-stamp.e2e.ts:36 uses obfuscated credential join fallback: const loginEmail = process.env.E2E_LOGIN_EMAIL ?? ['admin', 'mizano.com'].join('@');
     FAILED (failures=2)
     ```
   - **Detector loophole**: The blanket `process.env` check allowed hardcoded `pw:`/`password:` values on the same line as `process.env` assignments to go undetected (e.g., `const LOGIN = { email: process.env.EMAIL, pw: 'hardcoded' };` would pass).

### Head Behaviour (this branch, commit `737bd818`)

1. `find_hardcoded_credential_violations` accurately flags plaintext passwords (`password123`), template literals (`` `password123` ``), arbitrary passwords assigned in login/admin objects, sensitive login emails (`admin@mizano.com`), joined array obfuscations, and default fallback credentials in `process.env` lookups.
2. **Per-assignment detection**: Each `pw:`/`password:` assignment is checked individually. Hardcoded values mixed with `process.env` on the same line are flagged; pure `process.env` assignments pass.
3. All hardcoded fallback credentials removed from `e2e-army/104-smtp-rotation-stamp.e2e.ts`, `e2e-army/131-cross-tenant-delivery-challan.e2e.ts`, and `e2e-army/207-currency-fx-tenant-and-idempotency.e2e.ts`.
4. **NEW** `e2e-army/317-searchable-bill-options.e2e.ts` created with `LOGIN` sourced exclusively from `process.env` (no fallbacks), resolving the original PR #340 finding `7921754e38c2` for this file.
5. `scripts/test_e2e_army_hygiene.py` runs all 26 unit and integration tests cleanly with exit code 0.
6. `test_issue_378_evidence_contract` and all 12 tests in `scripts/test_evidence_freshness.py` pass with exit code 0.
7. All specs in `e2e-army/` are sanitized and comply with credential hygiene rules.

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies documentation (`docs/agents/review-lessons.md`), test hygiene validation tooling (`scripts/test_e2e_army_hygiene.py`), e2e test credential sourcing (`e2e-army/*.e2e.ts`), and evidence verification (`docs/evidence/378/EVIDENCE.md`, `scripts/test_evidence_freshness.py`).
- No UI components, routes, layout, styling, or localized strings are altered.
