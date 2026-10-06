# Evidence for Issue #97

## Tested Commit SHA

`b83d72b4cfa358f3a6ba4be9d9f1b613ac9fe1f2` (master)

## Test Output

Since no ETA/VAT notification client or related env loader was found in `apps/api`, I stopped the implementation as per the issue brief ("If there is no ETA integration, this PR is only the doc plus AI_QUESTIONS.md, and the implementer stops there.").

Therefore, no new code for `credential-age` was written and no new tests were run.

### Verification of Missing ETA Integration

Command run: `grep -rwi "eta" apps/api/src`
Result: Empty (no matches found).

Command run: `grep -rwi "notify" apps/api/src`
Result: Only matches for general user notifications (`notifications.service.spec.ts`), no ETA integration found.

## Requirements Validated

- [x] Record the `master` SHA (`b83d72b4cfa358f3a6ba4be9d9f1b613ac9fe1f2`).
- [x] Search `apps/api` for an existing ETA/VAT notification client and the env/config loader.
- [x] Add "Rotate integration credentials (≤90 days)" to the production settings checklist (`deploy/pi/README.md`).
- [x] Document missing ETA client and answers to slice 2 & 3 in `AI_QUESTIONS.md`.
