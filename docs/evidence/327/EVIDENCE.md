# EVIDENCE.md — Issue #327: Re-run evidence checks and header freshness guard

This document provides verification evidence for GitHub issue #327 in `AbdelrhmanAh7/Mizano`.

- **Issue**: [#327](https://github.com/AbdelrhmanAh7/Mizano/issues/327)
- **PR**: Supersedes part of #268
- **Base commit**: `e07f1e3d7585844a9af23dae48f870087993e4b3` (`origin/master`)
- **Tested branch**: `ai/327`
- **Originating Sentry issue**: None (internal QA finding on PR #268, item `finding:0c995b7c7170`)
- **Host environment**: Darwin arm64 (macOS), Python 3.12, pnpm 8.14.0, Node.js v20+

## Context & Finding Summary

In PR #268 (implementing issue #153), QA flagged finding `0c995b7c7170`:

> EVIDENCE.md header (#153 section): 'Tested code SHA: 8364be1… (the only later commit is this file)' is no longer true. Round 4 changed `e2e-army/153-e2e-army-gate.e2e.ts`, `bank-accounts.service.ts` and `.github/workflows/e2e-army.yml`, and Round 5 merged master (`99abae33`). The only recorded e2e-army runs predate these changes... This repeats the lesson 'Re-run evidence checks against the final PR head'.

Issue #327 was split from PR #268 to resolve this finding cleanly on a fresh branch off `master`. This PR supersedes part of #268 by:

1. Formalizing the review lesson into `docs/agents/review-lessons.md`.
2. Providing an automated regression guard (`scripts/test_evidence_freshness.py`) that checks evidence SHA validity, verifies adherence to the review lesson, and detects false exclusivity claims when subsequent code modifications exist.
3. Demonstrating red-to-green regression verification.

## Acceptance Criteria

- **AC1 (Review Lessons Rule)**: Add the rule **"Re-run evidence checks against the final PR head"** to `docs/agents/review-lessons.md` requiring that any subsequent review rounds modifying code, tests, CI config, or merging upstream master must re-execute verification checks on the final tested code head, recording updated SHAs and outputs.
- **AC2 (Automated Regression Guard)**: Create `scripts/test_evidence_freshness.py` with unit tests verifying:
  - The review lesson rule is documented in `docs/agents/review-lessons.md`;
  - All evidence headers in `docs/evidence/*/EVIDENCE.md` contain valid git SHAs (7 to 40 hex characters);
  - Exclusivity claim validation detects false claims when subsequent code/test modifications occur;
  - Clean headers pass validation without false positives.
- **AC3 (Red-Green Regression Proof)**: Demonstrate that the regression test fails on base/missing rule and passes cleanly with exit code 0 on head.
- **AC4 (Verification & Traceability)**: Explicitly map acceptance criteria to verification commands and observed exit codes, link the finding, and state "Supersedes part of #268".

## Verification Matrix

| AC ID   | Acceptance Criterion                  | Verification Command                                                                                                         | Observed Exit Code |   Status   |
| :------ | :------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------- | :----------------: | :--------: |
| **AC1** | Review lesson documented              | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_review_lessons_records_rerun_evidence_rule` |         0          | **PASSED** |
| **AC2** | Automated guard & SHA validation      | `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'`                                                    |         0          | **PASSED** |
| **AC3** | Red-to-green regression proof         | Planted stale header / missing rule fails (exit 1); head passes (exit 0)                                                     |         0          | **PASSED** |
| **AC4** | Verification report & supersedes note | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_327_evidence_contract`                |         0          | **PASSED** |

## Covering Tests

- `scripts/test_evidence_freshness.py`: 5 tests covering review lesson presence, valid SHA syntax in evidence headers, planted stale exclusivity detection, clean header validation, and issue #327 evidence contract.
