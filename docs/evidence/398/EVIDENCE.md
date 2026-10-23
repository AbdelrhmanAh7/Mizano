# Evidence for Issue #398: AC5 Verification and Evidence Freshness Automation

This document provides verification evidence for GitHub issue #398 in `AbdelrhmanAh7/Mizano` (follow-up review findings from PR #394 / parent issue #391).

- **Issue**: [#398](https://github.com/AbdelrhmanAh7/Mizano/issues/398)
- **PR**: Supersedes part of #394
- **Parent Issue**: #391, #330
- **Base Commit (`origin/master`)**: `a449f1aad52493e129e06beee47dbc560fecc475`
- **Tested Head Commit**: `602a7699524a0aed45c5c86a62f7dbd5005a87df`
- **Tested Branch**: `ai/398`
- **Originating Sentry Issue**: None (originates from review findings on PR #394 / parent issue #391).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20.18.0, pnpm 8.14.0, Python 3.14.8.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — developer tooling script validation and documentation freshness checks; no user-facing flows modified.`).
- **Skills Used**: `tdd`, `writing-plans`, `verification-before-completion`, `model-effort-routing`, `pr`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: TDD implementation of AC5 validator and CLI in scripts/test_evidence_freshness.py, docs/evidence/391/EVIDENCE.md harmonization, and verification report for issue #398`.

---

## Context & Finding Summary

In PR #394 (follow-up from #391 / #330), QA review findings highlighted:

> `QA Engineer: [p3] docs/evidence/391/EVIDENCE.md:49: Added AC5 verification for TypeScript type checking and ESLint check, which is a good addition for code quality assurance.`
> `QA Engineer: [p3] scripts/test_evidence_freshness.py:339: Updated test to check for AC5 in evidence documentation, ensuring the new acceptance criterion is properly documented.`

This issue (#398) formalizes and automates the AC5 quality gate across evidence documents:

1. **Automated AC5 Quality Validator**: Implemented `validate_evidence_ac5(text: str) -> list[str]` in `scripts/test_evidence_freshness.py` to inspect evidence files for explicit AC5 definitions, TypeScript type check records (`type-check`, `tsc`), ESLint verification (`eslint`, `lint`), and `PASSED` status with exit code 0.
2. **CLI File Validation Mode**: Updated `scripts/test_evidence_freshness.py` to support CLI invocation with file path arguments (`python3 scripts/test_evidence_freshness.py <file1> <file2> ...`), printing clear diagnostics on failure and exiting 0 on clean verification.
3. **Harmonized PR #391 Evidence Document**: Restored and harmonized `docs/evidence/391/EVIDENCE.md` with verified AC5 records for TypeScript typecheck and ESLint checks.
4. **Behavioral Test Coverage**: Added comprehensive positive and negative unit tests in `scripts/test_evidence_freshness.py` and forwarded in `tests/test_evidence_freshness.py` validating compliance with spec constraints.
5. **Legacy Exemption**: Added explicit handling in `scripts/test_evidence_freshness.py` for pre-standardization evidence doc `docs/evidence/352/EVIDENCE.md` preventing false failures on legacy records.

---

## Numbered Acceptance Criteria

- **AC1 (AC5 Quality Verification Function in Evidence Freshness Script)**: `scripts/test_evidence_freshness.py` provides `validate_evidence_ac5(text: str) -> list[str]` which:
  - Normalizes and checks for AC5 presence (accepting markdown headings, bullets `- **AC5`, `ac5`, `AC-5`).
  - Verifies presence of TypeScript type checking (`type-check`, `tsc`, `type checking`).
  - Verifies presence of ESLint verification (`eslint`, `lint`).
  - Verifies that AC5 status claims `PASSED` with exit code 0 and is not `PENDING` or unrun.
  - Returns descriptive diagnostic violation strings for missing criteria or unverified statuses.
- **AC2 (Freshness Script CLI Validation Mode)**: `scripts/test_evidence_freshness.py` supports CLI file path arguments (e.g. `python3 scripts/test_evidence_freshness.py <file1> <file2> ...`):
  - Validates tested head SHA binding, table status freshness, and AC5 verification.
  - Exits with code 0 on complete pass, or exit code 1 with explicit diagnostic error lines on violations.
  - Preserves standard unittest execution when executed without file path arguments or via `python3 -m unittest`.
- **AC3 (Unit Test Coverage for AC5 Validation & CLI Mode)**: Comprehensive unit tests in `scripts/test_evidence_freshness.py` (and forwarded in `tests/test_evidence_freshness.py`) verifying:
  - Valid AC5 documents pass with 0 violations.
  - Missing AC5 is flagged with a descriptive error.
  - Missing TypeScript type checking is flagged.
  - Missing ESLint verification is flagged.
  - Contradictory/pending AC5 status is flagged.
  - CLI file validation mode execution exits with code 0 for compliant evidence files.
- **AC4 (Harmonize PR #391 Evidence Document & Contract)**:
  - `docs/evidence/391/EVIDENCE.md` is present, documenting AC5 with verified TypeScript (`pnpm --filter api type-check`) and ESLint (`pnpm --filter api lint`) checks with exit code 0 and status `PASSED`.
  - `test_issue_391_evidence_contract` validates that `docs/evidence/391/EVIDENCE.md` satisfies all freshness constraints, AC1-AC5, and valid tested head SHA binding.
- **AC5 (TypeScript Typecheck, ESLint & Evidence Contract Quality)**:
  - Clean branch off `origin/master`, total PR diff touches 0 files in `.github/workflows/`.
  - TypeScript type check (`pnpm --filter api type-check`) passes with exit code 0.
  - ESLint verification (`pnpm --filter api lint`) passes with exit code 0.
  - `docs/evidence/398/EVIDENCE.md` documents full verification report mapping AC1-AC5 with exact commands, observed exit codes, and status `PASSED`.
  - 100% of unit tests pass in `scripts/test_evidence_freshness.py` and `tests/test_evidence_freshness.py`.

---

## Verification Matrix

| AC ID   | Requirement Description                    | Verification Method / Command                                                                                                     | Observed Result                                                                   | Exit Code | Status     |
| :------ | :----------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :-------- | :--------- |
| **AC1** | AC5 validator function in freshness script | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_validate_evidence_ac5_passes_compliant_document` | 1 test PASS (`validate_evidence_ac5` returns 0 violations on compliant document)  | 0         | **PASSED** |
| **AC2** | CLI validation mode on evidence files      | `python3 scripts/test_evidence_freshness.py docs/evidence/391/EVIDENCE.md`                                                        | PASS: docs/evidence/391/EVIDENCE.md - tested head, table status, and AC5 verified | 0         | **PASSED** |
| **AC3** | Behavioral unit test suite (scripts/tests) | `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'`                                                         | 19/19 tests PASS in 0.05s (positive, negative, edge-case, and CLI mode tests)     | 0         | **PASSED** |
| **AC4** | Harmonized #391 evidence contract check    | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_391_evidence_contract`                     | 1 test PASS (AC1-AC5, Exit Code, tested head binding, status, and AC5 validated)  | 0         | **PASSED** |
| **AC5** | API TypeScript type checking verification  | `pnpm --filter api type-check`                                                                                                    | Clean type check (`tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json`)       | 0         | **PASSED** |
| **AC5** | API ESLint check verification              | `pnpm --filter api lint`                                                                                                          | Clean lint check (0 errors, 0 warnings across all files)                          | 0         | **PASSED** |
| **AC5** | Evidence contract check for issue #398     | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_398_evidence_contract`                     | 1 test PASS (AC1-AC5, Exit Code, tested head binding, status, and AC5 validated)  | 0         | **PASSED** |

---

## Changed Covering Tests

- `scripts/test_evidence_freshness.py`:
  - `test_validate_evidence_ac5_passes_compliant_document`: Verifies valid AC5 blocks with TypeScript typecheck and ESLint pass cleanly.
  - `test_validate_evidence_ac5_flags_missing_ac5`: Verifies error emitted when AC5 criterion is omitted.
  - `test_validate_evidence_ac5_flags_missing_typescript_or_eslint`: Verifies distinct diagnostic errors when type checking or linting is omitted.
  - `test_validate_evidence_ac5_flags_pending_or_nonzero_exit_code`: Verifies failure flagged on non-zero exit code or PENDING status.
  - `test_issue_391_evidence_contract`: Verifies `docs/evidence/391/EVIDENCE.md` satisfies AC1-AC5, supersedes notice, exit codes, and head binding.
  - `test_issue_398_evidence_contract`: Verifies `docs/evidence/398/EVIDENCE.md` contract compliance.
  - `test_cli_validation_mode_succeeds_on_compliant_file`: Verifies CLI invocation with file argument succeeds with exit code 0.
- `tests/test_evidence_freshness.py` (new):
  - Forwards runner execution to `scripts/test_evidence_freshness.py` ensuring spec-mandated test path compatibility.

---

## Bug Fix / Regression Demonstration

### Base Behaviour (commit `a449f1aa`)

On `master`:

1. `scripts/test_evidence_freshness.py` lacked any `validate_evidence_ac5` function; evidence documents could omit TypeScript typecheck or ESLint checks without detection.
2. Executing `python3 scripts/test_evidence_freshness.py docs/evidence/391/EVIDENCE.md` failed with `AttributeError: module '__main__' has no attribute 'docs/evidence/391/EVIDENCE'` because CLI argument parsing was unsupported.
3. `docs/evidence/391/EVIDENCE.md` was absent from master.
4. `test_issue_391_evidence_contract` did not exist in `scripts/test_evidence_freshness.py`.

### Head Behaviour (this branch)

1. `validate_evidence_ac5` is implemented and validates AC5 presence, TypeScript typecheck (`tsc`/`type-check`), ESLint check (`eslint`/`lint`), and `PASSED` status.
2. `python3 scripts/test_evidence_freshness.py docs/evidence/391/EVIDENCE.md` completes with exit code 0 and reports `PASS: docs/evidence/391/EVIDENCE.md - tested head, table status, and AC5 verified clean`.
3. `docs/evidence/391/EVIDENCE.md` is present and verified.
4. All 19 tests in `scripts/test_evidence_freshness.py` and `tests/test_evidence_freshness.py` pass cleanly (exit code 0).

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue is developer tooling script validation and documentation quality assurance.
- No frontend files in `apps/web` or UI routes are modified.
- No Playwright screenshots or RTL/LTR layout tests are required.
