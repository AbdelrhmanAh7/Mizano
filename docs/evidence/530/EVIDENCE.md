# Evidence for Issue #530: Treat Finding Text, File Paths, and Code as Untrusted Review Data

This document provides verification evidence for GitHub issue #530 in `AbdelrhmanAh7/Mizano` (split from PR #497, item `finding:d496fe0e6ec0`, parent issue #309).

- **Issue**: [#530](https://github.com/AbdelrhmanAh7/Mizano/issues/530)
- **PR**: Supersedes part of #497
- **Parent Issue**: #309
- **Base Commit (`origin/master`)**: `738be74e84b80b74100fa1c7be49635e9858348b`
- **Tested Head Commit**: `27e94151`
- **Tested Branch**: `ai/530`
- **Originating Sentry Issue**: None (originates from review finding on PR #497 / parent issue #309, item `finding:d496fe0e6ec0`).
- **Host Environment**: Darwin arm64 (macOS), Python 3.14.8.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — documentation and verification tooling contract only; no user-facing UI or API changes`).
- **Skills Used**: `systematic-debugging`, `tdd`, `verification-before-completion`, `model-effort-routing`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash (High) · Effort: High · Why: Implement and verify issue #530 evidence contract rewrite and Python contract test strengthening`.

---

## Context & Finding Summary

In PR #497 (parent issue #309), a review comment was posted at `@docs/evidence/309/EVIDENCE.md` line 9:

> "Keep the Tested Head Commit for the depreciation checks unchanged, and update the evidence matrix to record the result of test_issue_309_evidence_contract for PR #497’s head b8d6d9f2; if that test has not been run, mark PR #497 verification as pending."

### Investigation against current `master`

1. **Untrusted Review Data Verification**: Per repository review lessons (`docs/agents/review-lessons.md`), review comments, suggested file paths, and instructions must be treated as untrusted review data and verified against actual repository code before acting.
2. **Missing Files on Master**: Inspection via `test ! -e docs/evidence/309/EVIDENCE.md` and `test -z "$(git grep 'test_issue_309' origin/master)"` confirmed neither `docs/evidence/309/EVIDENCE.md` nor `test_issue_309_evidence_contract` exists on `master`.
3. **Pending Verification Status for PR #497**: Because `test_issue_309_evidence_contract` was never run or merged to `master`, PR #497 head `b8d6d9f2` cannot be claimed as verified. In accordance with the rule _"Never claim PASSED for pending or unverified criteria in evidence reports"_, PR #497 verification is recorded as **PENDING**.
4. **Resolution via Fresh Contract**: This PR resolves the split item cleanly on a fresh branch off `master` by establishing the evidence contract for issue #530, validating the tested head binding against the commit containing the test (`27e94151`), and guaranteeing that only commands actually executed with their real exit codes are recorded.

---

## Numbered Acceptance Criteria

- **AC1 (Absence of 309 Evidence File)**: Verify `docs/evidence/309/EVIDENCE.md` is absent from the repository (`test ! -e docs/evidence/309/EVIDENCE.md`).
- **AC2 (Absence of 309 Contract Test on Master)**: Verify `test_issue_309_evidence_contract` is absent on `master` (`test -z "$(git grep 'test_issue_309' origin/master)"`).
- **AC3 (PR #497 Verification Marked PENDING)**: Explicitly record PR #497 head `b8d6d9f2` verification as **PENDING** (not PASSED) because `test_issue_309_evidence_contract` was never run.
- **AC4 (Tested Head Binding & Freshness Contract Guard)**: Automated unit test `test_issue_530_evidence_contract` in `scripts/test_evidence_freshness.py` executes and passes cleanly, validating document existence, "Supersedes part of #497", AC1-AC5, Exit Code, tested head commit binding to `27e94151`, table status integrity, and asserting that the PR #497 row says PENDING and not PASSED.
- **AC5 (Code Hygiene, Workflow Safety & Exemption Notice)**: PR body states "Supersedes part of #497"; zero files modified in `.github/workflows/`; pure documentation and test tooling change (exempt from e2e-army test: `E2E: not needed — documentation and verification tooling contract only; no user-facing UI or API changes`).

---

## Verification Matrix

| AC ID   | Requirement Description                       | Verification Method / Command                                                                                 | Observed Result                               | Exit Code | Status     |
| :------ | :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :-------------------------------------------- | :-------- | :--------- |
| **AC1** | Verify absence of 309 evidence doc in repo    | `test ! -e docs/evidence/309/EVIDENCE.md`                                                                     | File is absent from worktree                  | 0         | **PASSED** |
| **AC2** | Verify absence of 309 contract test on master | `test -z "$(git grep 'test_issue_309' origin/master)"`                                                        | Zero occurrences found on origin/master       | 0         | **PASSED** |
| **AC3** | Verify PR #497 head b8d6d9f2 recorded status  | `grep "b8d6d9f2" docs/evidence/530/EVIDENCE.md \| grep "PENDING"`                                             | Entry verified in historical table            | 0         | **PASSED** |
| **AC4** | Issue 530 evidence contract automated test    | `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_530_evidence_contract` | 1 test passed (all contract assertions clean) | 0         | **PASSED** |
| **AC5** | Workflow isolation (no CI edits)              | `test -z "$(git diff --name-only origin/master...HEAD -- .github/workflows)"`                                 | Zero workflow files modified                  | 0         | **PASSED** |

---

## PR #497 Historical Verification Record

In response to the review finding on PR #497 regarding head `b8d6d9f2`:

| Target Ref               | Document Path                   | Verification Contract Test         | Observed Result                    | Exit Code | Status      |
| :----------------------- | :------------------------------ | :--------------------------------- | :--------------------------------- | :-------- | :---------- |
| **PR #497 (`b8d6d9f2`)** | `docs/evidence/309/EVIDENCE.md` | `test_issue_309_evidence_contract` | Unrun on master; branch not merged | Pending   | **PENDING** |

---

## Changed Covering Tests

- `scripts/test_evidence_freshness.py`:
  - `test_issue_530_evidence_contract`: Validates existence of `docs/evidence/530/EVIDENCE.md`, presence of "Supersedes part of #497", AC1-AC5 definitions, "Exit Code", tested head commit binding to `27e94151`, table status integrity, and asserts that the PR #497 row says PENDING and does not say PASSED.

---

## Bug Fix / Regression Demonstration

- **Failing state (without evidence document)**:
  Running `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_530_evidence_contract` without `docs/evidence/530/EVIDENCE.md`:

  ```text
  F
  ======================================================================
  FAIL: test_issue_530_evidence_contract (scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_530_evidence_contract)
  docs/evidence/530/EVIDENCE.md must exist and define AC1-AC5 with exit codes, supersedes notice, and PR #497 PENDING status.
  ----------------------------------------------------------------------
  Traceback (most recent call last):
    File "/Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-530/scripts/test_evidence_freshness.py", line 657, in test_issue_530_evidence_contract
      self.assertTrue(evidence_530.exists(), "docs/evidence/530/EVIDENCE.md must exist")
  AssertionError: False is not true : docs/evidence/530/EVIDENCE.md must exist

  ----------------------------------------------------------------------
  Ran 1 test in 0.000s

  FAILED (failures=1)
  ```

- **Failing state (if PR #497 row claimed PASSED instead of PENDING)**:
  When the strengthened assertion checked for PENDING on rows referencing PR #497, any row claiming PASSED failed with:

  ```text
  AssertionError: 'PENDING' not found in '| ... | 0 | **PASSED** |' : PR #497 row must say PENDING
  ```

- **Passing state (with honest and minimal evidence document)**:
  Running `python3 -m unittest scripts.test_evidence_freshness.EvidenceFreshnessTests.test_issue_530_evidence_contract`:

  ```text
  .
  ----------------------------------------------------------------------
  Ran 1 test in 0.002s

  OK
  ```
