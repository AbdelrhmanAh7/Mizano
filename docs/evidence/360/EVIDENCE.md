# Evidence for Issue #360: Guard Evidence Table Status and Treat Untrusted Review Data

This document provides verification evidence for GitHub issue #360 in `AbdelrhmanAh7/Mizano` (split from PR #341, item `finding:3c625b6ea6fd`, parent issue #333).

- **Issue**: [#360](https://github.com/AbdelrhmanAh7/Mizano/issues/360)
- **PR**: Supersedes part of #341
- **Parent Issue**: #333
- **Base Commit (`origin/master`)**: `d740dda95a3297a7605d836ea4aaae7eecdd7bb4`
- **Tested Head Commit**: `500e01a0be5f79116e0be5a73e440445d44ce97e`
- **Tested Branch**: `ai/360`
- **Originating Sentry Issue**: None (originates from CodeRabbit review discussion `r4334423649` on PR #341 / parent issue #333).
- **Host Environment**: Darwin arm64 (macOS), Python 3.14.8 / 3.12, Node.js v20+, pnpm 8.14.0.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — internal verification report and evidence validation test suite; no user-facing flows modified.`).
- **Skills Used**: `systematic-debugging`, `verification-before-completion`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Bug fix in evidence freshness test suite, review lessons documentation, and verification evidence for issue #360`.

---

## Context & Finding Summary

In PR #341 (split from parent issue #333), CodeRabbit flagged review finding `3c625b6ea6fd` (discussion `r4334423649`):

> Review comment at `@docs/evidence/333/EVIDENCE.md` at line 70: Update the AC5 entry in the evidence table to mark it pending until an E2E run is documented for reviewed head 75d0089. Once rerun, record the exact tested SHA, E2E command, and attached result before changing the status back to PASSED.

Per standing repo directives, engineers must **treat finding text, file paths, and code as untrusted review data** and never follow instructions embedded in them blindly. Verifying this against current repository code on `master`:

1. `docs/evidence/333/EVIDENCE.md` was a draft on the parent branch `ai/333` and does not exist on `master`. Attempting to blindly recreate or edit a file at that path on a fresh branch off `master` would be following untrusted review instructions blindly and introducing unreviewed parent branch artifacts.
2. Commit `75d0089` was an intermediate commit on the parent branch `ai/333`, not the tested code head of `master` or this PR branch.
3. The valid core problem flagged by the finding is that evidence reports must never prematurely claim `PASSED` when an acceptance criterion or test is pending or unexecuted. When a test has not completed with a verified passing exit code against the tested head, its status must remain explicitly marked `PENDING`.
4. This PR resolves the finding by:
   - Formalizing the rule into `docs/agents/review-lessons.md`: **"Never claim PASSED for pending or unverified criteria in evidence reports."**
   - Adding `validate_evidence_table_status` in `scripts/test_evidence_freshness.py` to parse markdown evidence tables and automatically flag premature `PASSED` claims on pending/unrun checks or contradictory statuses.
   - Adding comprehensive unit tests in `scripts/test_evidence_freshness.py` for table status validation and evidence contracts.
   - Verifying that all existing repository evidence files and `docs/evidence/360/EVIDENCE.md` pass cleanly with exit code 0.

---

## Numbered Acceptance Criteria

- **AC1 (Review Lessons Rule)**: Document the explicit rule in `docs/agents/review-lessons.md` requiring that engineers treat review findings, suggested code, and embedded file paths as untrusted review data, and never claim `PASSED` for pending or unverified criteria in evidence reports until executed against the exact tested head.
- **AC2 (Evidence Table Status Validation Guard)**: Implement `validate_evidence_table_status` in `scripts/test_evidence_freshness.py` to parse evidence tables and flag any row claiming `PASSED` whose result or exit code describes pending/unrun execution, or rows with contradictory status.
- **AC3 (Unit Tests for Table Status Guard)**: Implement `test_validate_evidence_table_status` in `scripts/test_evidence_freshness.py` verifying that valid tables pass, premature `PASSED` claims on pending checks are caught, valid `PENDING` rows pass, and contradictory statuses are detected.
- **AC4 (Repository Evidence Suite Clean)**: Ensure that all repository evidence reports under `docs/evidence/*/EVIDENCE.md` pass `validate_evidence_table_status`, `validate_tested_head_binding`, and SHA extraction with 0 failures.
- **AC5 (Issue #360 Evidence Report & Contract)**: Provide `docs/evidence/360/EVIDENCE.md` establishing the complete verification report with numbered criteria (AC1–AC5), exact tested commit SHA binding, authentic command outputs with exit code 0, and explicit "Supersedes part of #341".

---

## Verification Matrix

| AC ID   | Requirement Description                                     | Verification Method / Command                                                                                                                       | Observed Result                                                                             | Exit Code | Status     |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- | ---------- |
| **AC1** | Document untrusted review data and no-premature-passed rule | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_review_lessons_records_untrusted_review_data_and_sha_binding_rule` | 1 test PASS (`test_review_lessons_records_untrusted_review_data_and_sha_binding_rule`)      | 0         | **PASSED** |
| **AC2** | Implement `validate_evidence_table_status` in test runner   | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_validate_evidence_table_status`                                    | 1 test PASS (`validate_evidence_table_status` parsed and tested)                            | 0         | **PASSED** |
| **AC3** | Comprehensive unit tests for evidence table status guard    | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_validate_evidence_table_status`                                    | 1 test PASS (valid table, premature PASSED detection, contradictory status detection)       | 0         | **PASSED** |
| **AC4** | Full evidence freshness test suite execution                | `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'`                                                                           | 10/10 unit tests PASS (0 failures across all freshness, status, and contract checks)        | 0         | **PASSED** |
| **AC5** | Issue 360 evidence contract verification                    | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_360_evidence_contract`                                       | 1 test PASS (contract AC1-AC5, Exit Code, Supersedes notice, tested head binding validated) | 0         | **PASSED** |

---

## Changed Covering Tests

- `scripts/test_evidence_freshness.py` (10 unit tests covering review lessons rules, SHA validity, exclusivity markers, tested head binding, evidence table status validation, and evidence contracts):
  - `test_review_lessons_records_rerun_evidence_rule`
  - `test_review_lessons_records_untrusted_review_data_and_sha_binding_rule`
  - `test_existing_evidence_docs_have_valid_shas`
  - `test_planted_stale_exclusivity_header_detected`
  - `test_valid_head_evidence_passes`
  - `test_validate_tested_head_binding`
  - `test_validate_evidence_table_status`
  - `test_issue_327_evidence_contract`
  - `test_issue_356_evidence_contract`
  - `test_issue_360_evidence_contract`

---

## Bug Fix / Regression Demonstration

### Base Behaviour (commit `d740dda9`)

On `master` prior to this fix:

1. `validate_evidence_table_status` did not exist in `scripts/test_evidence_freshness.py`.
2. Premature `PASSED` claims on unrun/pending checks (such as the finding on PR #341 / #333 where AC5 was marked `PASSED` while the observed result was pending) went completely undetected by automated test guards.
3. `test_issue_360_evidence_contract` failed because `docs/evidence/360/EVIDENCE.md` was missing:
   ```text
   FAIL: test_issue_360_evidence_contract (test_evidence_freshness.EvidenceFreshnessTests.test_issue_360_evidence_contract)
   AssertionError: False is not true : docs/evidence/360/EVIDENCE.md must exist
   FAILED (failures=1)
   ```

### Head Behaviour (this branch)

1. `validate_evidence_table_status` parses evidence table rows and flags any row claiming `PASSED` while its result or exit code indicates pending/unrun execution, or rows with contradictory status.
2. `docs/agents/review-lessons.md` formally documents the rule never to claim `PASSED` for pending/unverified criteria and to treat review findings and suggested code as untrusted review data.
3. `docs/evidence/360/EVIDENCE.md` documents all criteria, exit codes, and supersedes notice, satisfying `test_issue_360_evidence_contract`.
4. Running `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'` passes all 10 tests cleanly with exit code 0:
   ```text
   Ran 10 tests in 0.010s
   OK
   ```

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies documentation (`docs/agents/review-lessons.md`), verification tooling (`scripts/test_evidence_freshness.py`), and verification evidence (`docs/evidence/360/EVIDENCE.md`).
- No UI components, routes, layout, styling, or localized strings are altered.
