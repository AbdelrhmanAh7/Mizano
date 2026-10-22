# Evidence for Issue #378: Guard against hardcoded login credentials in e2e-army specs

This document provides verification evidence for GitHub issue #378 in `AbdelrhmanAh7/Mizano` (split from PR #340, item `finding:7921754e38c2`, parent issue #317).

- **Issue**: [#378](https://github.com/AbdelrhmanAh7/Mizano/issues/378)
- **PR**: Supersedes part of #340
- **Parent Issue**: #317
- **Base Commit (`origin/master`)**: `bf3f67a80294e9c79f1bb5bfab65ac637e21658a`
- **Tested Head Commit**: `9af47a5eb28b9d586a1dbce5b8973a57b9adc80c`
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

### Investigation & Root Cause

1. In PR #340 (which added `e2e-army/317-searchable-bill-options.e2e.ts`), lines 5-7 hardcoded plaintext login credentials directly in the test file:
   ```ts
   const SEED = 'army-317';
   const LOGIN = { email: 'admin@mizano.com', pw: 'password123' };
   ```
2. Automated review and security checks flagged this because hardcoded plaintext credentials expose sensitive account information directly within version control.
3. On `master`, `e2e-army/317-searchable-bill-options.e2e.ts` was not merged. However, the repository lacked automated hygiene guards to detect and prevent hardcoded plaintext credentials (`password123` and `admin@mizano.com`) from being introduced in `e2e-army` test suites.
4. Furthermore, `docs/agents/review-lessons.md` lacked a documented security guideline mandating dynamic credential sourcing (via `process.env.E2E_LOGIN_EMAIL` / `process.env.E2E_LOGIN_PASSWORD` or dynamic generation).

### Resolution & Review Threads Addressed (PR #412 Round 1)

1. Added an explicit rule in `docs/agents/review-lessons.md`:
   > **Never commit hard-coded sensitive credentials or plaintext passwords in e2e tests or test fixtures.** Source credentials dynamically from environment variables (`process.env.E2E_LOGIN_EMAIL`, `process.env.E2E_LOGIN_PASSWORD`) or generate throwaway credentials dynamically. Hard-coded credentials (`admin@mizano.com` / `password123`) fail repository security hygiene and automated review checks. _(#378)_
2. **Generalised Credential Violation Detection (`scripts/test_e2e_army_hygiene.py:30`)**:
   - Upgraded `find_hardcoded_credential_violations` to detect sensitive credentials across single quotes, double quotes, and backtick template literals (`` `password123` ``, `` `admin@mizano.com` ``).
   - Generalised the detector to flag arbitrary passwords assigned to `pw:` or `password:` keys in credential definitions (`const LOGIN = ...`, `const ADMIN = ...`, `params: ...`) that do not source dynamically from `process.env`.
   - Documented explicit scope in the module and function docstring.
3. **Repository-wide Integration Hygiene Checks (`scripts/test_e2e_army_hygiene.py:293`)**:
   - Added `test_no_hardcoded_credentials_in_e2e_army` which scans every `*.e2e.ts` file in `e2e-army/` to ensure zero hardcoded credential violations exist in the active test suite.
   - Added `test_e2e_login_specs_source_credentials_from_env` asserting that specs performing user login dynamically source credentials from `process.env`.
   - Retained `test_317_e2e_no_hardcoded_credentials` as a forward-compatible guard for when 317 specs are introduced.
4. **Sanitized Existing E2E Specs**:
   - Updated `e2e-army/104-smtp-rotation-stamp.e2e.ts`, `e2e-army/131-cross-tenant-delivery-challan.e2e.ts`, and `e2e-army/207-currency-fx-tenant-and-idempotency.e2e.ts` to source login credentials dynamically via `process.env.E2E_LOGIN_EMAIL` and `process.env.E2E_LOGIN_PASSWORD`.
5. Added contract test `test_issue_378_evidence_contract` in `scripts/test_evidence_freshness.py`.

---

## Numbered Acceptance Criteria

- **AC1 (Review Lessons Rule)**: Document the explicit security hygiene rule in `docs/agents/review-lessons.md` forbidding hardcoded sensitive credentials or plaintext passwords (`password123` / `admin@mizano.com`) in e2e tests or fixtures, and mandating dynamic sourcing (`process.env.E2E_LOGIN_EMAIL`, `process.env.E2E_LOGIN_PASSWORD`).
- **AC2 (Credential Violation Detection Tooling)**: Implement generalised `find_hardcoded_credential_violations` in `scripts/test_e2e_army_hygiene.py` to scan code for hardcoded credentials (plaintext passwords and sensitive login emails in quotes or backticks, as well as `pw`/`password` property assignments without `process.env`) while ignoring single-line (`//`) and multi-line (`/* ... */`) comments.
- **AC3 (Hygiene Unit Regression Tests)**: Provide comprehensive unit regression tests in `scripts/test_e2e_army_hygiene.py` verifying that:
  1. The PR #340 finding `7921754e38c2` snippet with hardcoded email and password is detected as a violation;
  2. Template literals with backticks are detected as violations;
  3. Arbitrary hardcoded passwords assigned in login/admin objects or params are detected;
  4. Planted 317 test code with hardcoded credentials fails detection with exit code 1;
  5. Isolated hardcoded login email (`admin@mizano.com`) is detected as a violation;
  6. Sanitized dynamic credentials from environment variables pass without violations.
- **AC4 (Repository-wide E2E Integration Hygiene Check)**: `test_no_hardcoded_credentials_in_e2e_army` and `test_e2e_login_specs_source_credentials_from_env` in `scripts/test_e2e_army_hygiene.py` verify that all `*.e2e.ts` files in `e2e-army/` contain zero hardcoded credentials and specs that log in source credentials via `process.env`.
- **AC5 (Automated Evidence & Contract Verification)**: `docs/evidence/378/EVIDENCE.md` documents all criteria, exit codes, exact tested head binding, and supersedes notice, verified by `test_issue_378_evidence_contract` in `scripts/test_evidence_freshness.py`.

---

## Verification Matrix

| AC ID   | Requirement Description                                          | Verification Method / Command                                                                                                              | Observed Result                                                                             | Exit Code | Status     |
| :------ | :--------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ | :-------- | :--------- |
| **AC1** | Document hardcoded credentials hygiene rule in review lessons    | `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py'`                                                                    | Rule verified in `docs/agents/review-lessons.md`, 20 tests PASS                             | 0         | **PASSED** |
| **AC2** | Implement generalised credential violation detector              | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_hardcoded_credentials_in_317_snippet_detected`      | 1 test PASS (`find_hardcoded_credential_violations` successfully detects violation)         | 0         | **PASSED** |
| **AC3** | Comprehensive unit regression tests for detection & sanitization | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyImportDetectorUnitTests.test_planted_317_hardcoded_credentials_regression_fails` | 1 test PASS (planted code detected at line 5 with exit code 0)                              | 0         | **PASSED** |
| **AC4** | Repository-wide e2e hygiene integration check                    | `python3 -m unittest scripts.test_e2e_army_hygiene.E2EArmyRepositoryHygieneTests.test_no_hardcoded_credentials_in_e2e_army`                | 1 test PASS (all e2e-army specs verified clean of hardcoded credentials)                    | 0         | **PASSED** |
| **AC5** | Evidence contract verification                                   | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_378_evidence_contract`                              | 1 test PASS (contract AC1-AC5, Exit Code, Supersedes notice, tested head binding validated) | 0         | **PASSED** |

---

## Changed Covering Tests

- `scripts/test_e2e_army_hygiene.py`:
  - `test_hardcoded_credentials_in_317_snippet_detected`
  - `test_hardcoded_credentials_template_literal_detected`
  - `test_arbitrary_hardcoded_password_literal_detected`
  - `test_hardcoded_email_detected`
  - `test_sanitized_credentials_accepted`
  - `test_planted_317_hardcoded_credentials_regression_fails`
  - `test_no_hardcoded_credentials_in_e2e_army`
  - `test_e2e_login_specs_source_credentials_from_env`
  - `test_317_e2e_no_hardcoded_credentials`
- `scripts/test_evidence_freshness.py`:
  - `test_issue_378_evidence_contract`

---

## Bug Fix / Regression Demonstration

### Base Behaviour (commit `bf3f67a80294e9c79f1bb5bfab65ac637e21658a`)

On `origin/master` prior to this fix:

1. `find_hardcoded_credential_violations` did not exist in `scripts/test_e2e_army_hygiene.py`.
2. Hardcoded plaintext credentials such as `const LOGIN = { email: 'admin@mizano.com', pw: 'password123' };` in e2e tests went completely undetected by automated repository test hygiene checks.
3. No rule in `docs/agents/review-lessons.md` existed to guide engineers on dynamic credential sourcing.
4. `test_issue_378_evidence_contract` failed because `docs/evidence/378/EVIDENCE.md` was missing:
   ```text
   FAIL: test_issue_378_evidence_contract (scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_378_evidence_contract)
   AssertionError: False is not true : docs/evidence/378/EVIDENCE.md must exist
   FAILED (failures=1)
   ```

### Head Behaviour (this branch)

1. `find_hardcoded_credential_violations` accurately flags plaintext passwords (`password123`), template literals (`` `password123` ``), arbitrary passwords assigned in login/credential objects, and sensitive login emails (`admin@mizano.com`), while ignoring comments and dynamic `process.env` sourcing.
2. `scripts/test_e2e_army_hygiene.py` runs 20 unit and integration tests cleanly with exit code 0.
3. `test_issue_378_evidence_contract` and all 12 tests in `scripts/test_evidence_freshness.py` pass with exit code 0.
4. All 100 python tests in `scripts/test_*.py` pass cleanly.
5. All specs in `e2e-army/` are sanitized and comply with credential hygiene rules.

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies documentation (`docs/agents/review-lessons.md`), test hygiene validation tooling (`scripts/test_e2e_army_hygiene.py`), e2e test credential sourcing (`e2e-army/*.e2e.ts`), and evidence verification (`docs/evidence/378/EVIDENCE.md`, `scripts/test_evidence_freshness.py`).
- No UI components, routes, layout, styling, or localized strings are altered.
