# Evidence for Issue #323: Untrack Root AI_QUESTIONS.md and Strengthen Hygiene Guards

This document provides verification evidence for GitHub issue #323 in `AbdelrhmanAh7/Mizano` (follow-up from #312, PR #451).

- **Issue**: [#323](https://github.com/AbdelrhmanAh7/Mizano/issues/323)
- **PR**: [#451](https://github.com/AbdelrhmanAh7/Mizano/pull/451)
- **Base Commit (`origin/master`)**: `8ec35a547d80eb5c815d514e1fa921564e67d94a`
- **Tested Head Commit**: `4e5261cc1db39ee2ce68da8ab1eb26b6680ec378`
- **Tested Branch**: `ai/323`
- **Originating Sentry Issue**: None (originates from QA Second Opinion non-blocking review finding on PR #312 / issue #279).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20.18.0, pnpm 8.14.0, Python 3.14.8.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — repository root hygiene and .gitignore configuration; no user-facing flows modified.`).
- **Skills Used**: `model-effort-routing`, `root-cause-debugging`, `systematic-debugging`, `test-first`, `principle-subtract-before-you-add`, `verification-before-completion`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Fix root files hygiene test and evidence contract to address QA review findings on #323, adhere to repo hygiene and ignore rules, and provide verifiable proof.`

---

## Context & Finding Summary

In PR #312, QA Second Opinion flagged:

> [p2] AI_QUESTIONS.md:1: Adding/retaining AI_QUESTIONS.md at the repository root repeats the recurring repo lesson that this file should not be tracked at root. It is unrelated to issue #279 and should be removed rather than included in this PR.

During round 1 review of PR #451 (commit `e319191a`), QA flagged:

1. `tests/hygiene/root-files.spec.ts:18`: Asserting `fs.existsSync(AI_QUESTIONS.md) === false` contradicts the purpose of the new ignore rule: the scratchpad is now explicitly allowed to exist locally as an untracked file. Any developer or agent that actually uses AI_QUESTIONS.md will get a failing test suite on every run. Assert only that the file is untracked/ignored (e.g. `git ls-files` or `git check-ignore`), not that it is absent from disk.
2. `.gitignore:117`: The PR only adds an ignore rule; it never removes AI_QUESTIONS.md itself, which is what issue #323 asks for... Delete it (`git rm AI_QUESTIONS.md`) as part of this PR.

### Investigation & Root Cause

1. `AI_QUESTIONS.md` was previously untracked/removed from master in commit `4c006386` (`test(api): specs for fixed-asset depreciation service`). In PR #312's branch, it had been temporarily introduced. Because #312 was not merged into master, `AI_QUESTIONS.md` was already not tracked and absent from master when `ai/323` branched off `master`. Thus, `git rm AI_QUESTIONS.md` cannot match any tracked file.
2. However, commit `e319191a` erroneously added `expect(fs.existsSync(aiQuestionsPath)).toBe(false)` in `tests/hygiene/root-files.spec.ts:18`. This contradicted repo conventions: agents and developers are permitted to have a local untracked `AI_QUESTIONS.md` scratch file while working.
3. The root cause fix requires:
   - Ensuring `/AI_QUESTIONS.md` is present in `.gitignore` so Git ignores the file and blocks staging (`git add AI_QUESTIONS.md` is rejected with exit code 1).
   - Updating `tests/hygiene/root-files.spec.ts` to assert that `AI_QUESTIONS.md` is untracked in git index (`git ls-files AI_QUESTIONS.md` is empty), actively ignored (`git check-ignore AI_QUESTIONS.md` returns `AI_QUESTIONS.md`), and rejected on `git add`, without asserting disk absence.
   - Adding automated Python hygiene tests in `scripts/test_root_files_hygiene.py` and evidence contract in `scripts/test_evidence_freshness.py`.

---

## Numbered Acceptance Criteria

- **AC1 (Untracked Root AI_QUESTIONS.md in Git Index)**: `AI_QUESTIONS.md` is not tracked in the git repository index (`git ls-files AI_QUESTIONS.md` returns empty string).
- **AC2 (Root GitIgnore Pattern)**: `.gitignore` contains `/AI_QUESTIONS.md` to prevent local ephemeral scratch files from being tracked or staged.
- **AC3 (Git Check-Ignore Verification)**: `git check-ignore AI_QUESTIONS.md` verifies that `AI_QUESTIONS.md` is actively ignored by git rules with exit code 0.
- **AC4 (Clean Working Tree with Local Scratchpad)**: When a local `AI_QUESTIONS.md` scratch file exists at repository root, `git status --porcelain AI_QUESTIONS.md` reports nothing and `git add AI_QUESTIONS.md` is rejected by git unless forced.
- **AC5 (Automated Hygiene Guard Execution)**: Automated hygiene tests in `tests/hygiene/root-files.spec.ts` pass with exit code 0 and 0 failures, asserting untracked status, `.gitignore` rule, check-ignore resolution, and git-add rejection without forbidding local existence.
- **AC6 (Evidence and Freshness Contract)**: `docs/evidence/323/EVIDENCE.md` exists and defines AC1-AC6, tested head SHA, and passes `scripts/test_evidence_freshness.py` and `scripts/test_root_files_hygiene.py`.

---

## Verification Report

| AC ID   | Requirement                                       | Command                                                      | Observed Result             | Exit Code | Status     |
| :------ | :------------------------------------------------ | :----------------------------------------------------------- | :-------------------------- | :-------- | :--------- |
| **AC1** | AI_QUESTIONS.md untracked in git repository index | `git ls-files AI_QUESTIONS.md`                               | (empty string, not tracked) | 0         | **PASSED** |
| **AC2** | .gitignore contains /AI_QUESTIONS.md ignore rule  | `grep -F "/AI_QUESTIONS.md" .gitignore`                      | `/AI_QUESTIONS.md`          | 0         | **PASSED** |
| **AC3** | git check-ignore matches AI_QUESTIONS.md          | `git check-ignore AI_QUESTIONS.md`                           | `AI_QUESTIONS.md`           | 0         | **PASSED** |
| **AC4** | Local scratchpad ignored and git add rejected     | `python3 scripts/test_root_files_hygiene.py`                 | 5 passed, 0 failed          | 0         | **PASSED** |
| **AC5** | Root files TypeScript hygiene test suite          | `npx jest --preset ts-jest tests/hygiene/root-files.spec.ts` | 5 passed, 0 failed          | 0         | **PASSED** |
| **AC6** | Evidence freshness and root hygiene contract      | `python3 scripts/test_evidence_freshness.py`                 | 12 passed, 0 failed         | 0         | **PASSED** |

---

## Changed Covering Tests

- `tests/hygiene/root-files.spec.ts` (5 tests):
  - `asserts AI_QUESTIONS.md is not tracked in git repository index`
  - `asserts AI_QUESTIONS.md is ignored by git ignore rules via git check-ignore`
  - `asserts git add AI_QUESTIONS.md is rejected by git unless forced`
  - `asserts .gitignore contains /AI_QUESTIONS.md ignore rule`
  - `asserts local AI_QUESTIONS.md scratch file is ignored by git status`
- `scripts/test_root_files_hygiene.py` (5 tests):
  - `test_ai_questions_not_tracked_in_git_index`
  - `test_gitignore_contains_ai_questions_rule`
  - `test_git_check_ignore_matches_ai_questions`
  - `test_local_ai_questions_file_ignored_by_git_status`
  - `test_git_add_ai_questions_rejected`
- `scripts/test_evidence_freshness.py` (1 contract test):
  - `test_issue_323_evidence_contract`

---

## Bug Fix / Regression Demonstration

### Base Behaviour (`8ec35a547d80eb5c815d514e1fa921564e67d94a`)

1. Prior to PR #451, `.gitignore` lacked `/AI_QUESTIONS.md`. Creating `AI_QUESTIONS.md` dirtied `git status --porcelain` and allowed accidental tracking via `git add .` or `git add AI_QUESTIONS.md`.
2. In PR commit `e319191a`, line 18 of `tests/hygiene/root-files.spec.ts` asserted `fs.existsSync(aiQuestionsPath) === false`, which caused failures if a developer or agent created a local scratchpad file.
3. `test_issue_323_evidence_contract` failed because `docs/evidence/323/EVIDENCE.md` was absent.

### Head Behaviour (this branch)

1. `.gitignore` contains `/AI_QUESTIONS.md`.
2. When `AI_QUESTIONS.md` is present on disk, `git status --porcelain AI_QUESTIONS.md` reports nothing and `git add AI_QUESTIONS.md` is rejected with exit code 1.
3. `tests/hygiene/root-files.spec.ts` asserts `git check-ignore` and untracked status rather than disk absence, allowing local scratchpads to exist without failing tests.
4. All 5 TypeScript tests and 12 Python freshness tests pass with 0 failures:
   ```text
   PASS tests/hygiene/root-files.spec.ts (5 passed)
   python3 scripts/test_root_files_hygiene.py (5 passed)
   python3 scripts/test_evidence_freshness.py (12 passed)
   ```

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies repository root configuration (`.gitignore`), hygiene test specifications (`tests/hygiene/root-files.spec.ts`), hygiene Python scripts, and evidence documentation.
- No frontend React UI components, CSS styling, or routes are altered.
