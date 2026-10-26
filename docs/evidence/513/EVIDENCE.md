# Evidence for Issue #513: Isolate husky fixture subprocesses from inherited Git environment

**Tested Code Head**: 40bbeb57
**Base commit**: d8649bec (merge of master into ai/513)

## Acceptance Criteria → Verification

| ID  | Criterion                                                                                                                                                                   | Test / Command                                                                                                                                                                                                                                                                                                                                                                          | Result                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AC1 | Reproduce contamination with representative Git variables (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT/KEY/VALUE) | `test_sanitized_git_env_contract_and_immutability`, `test_git_env_helper_scrubs_local_vars_and_preserves_allowlist`, `test_git_and_push_helpers_do_not_touch_decoy_repo`                                                                                                                                                                                                                | PASS — all contaminating variables stripped from sanitized env; decoy repo unchanged |
| AC2 | Fixture git operations confined to temporary repository                                                                                                                     | `test_git_and_push_helpers_do_not_touch_decoy_repo` — decoy HEAD, refs, index and config byte-identical before/after                                                                                                                                                                                                                                                                    | PASS                                                                                 |
| AC3 | Fixture push operations confined to fixture remote                                                                                                                          | `test_push_isolates_from_inherited_git_env_with_decoy` (PrePushHookTests.push() path) — decoy HEAD and index unchanged after push() with GIT_DIR etc. exported                                                                                                                                                                                                                          | PASS                                                                                 |
| AC4 | run_hook path isolated from inherited Git env                                                                                                                               | `test_run_hook_isolates_from_inherited_git_env`, `test_run_hook_isolates_from_inherited_git_env_with_decoy` — probe hook resolves git dir to target, not decoy; contaminating vars absent                                                                                                                                                                                               | PASS                                                                                 |
| AC5 | Unrelated variable survives on all paths                                                                                                                                    | `test_sanitized_git_env_contract_and_immutability` (MIZANO_FIXTURE_SENTINEL=keep-sentinel), `test_git_env_helper_scrubs_local_vars_and_preserves_allowlist` (MIZANO_TEST_SENTINEL=sentinel-42), `test_run_hook_isolates_from_inherited_git_env` (MIZANO_TEST_SENTINEL=hook-sentinel-value), `test_push_isolates_from_inherited_git_env_with_decoy` (MIZANO_TEST_SENTINEL=push-sentinel) | PASS — sentinel present in all 3 subprocess paths                                    |
| AC6 | Explicit fixture overrides applied (GIT_AUTHOR_NAME, GIT_CONFIG_NOSYSTEM, HOME)                                                                                             | `test_sanitized_git_env_contract_and_immutability` (GIT_AUTHOR_NAME override wins), `test_git_env_wrapper_forwards_positional_as_overrides` (\_git_env positional → overrides)                                                                                                                                                                                                          | PASS                                                                                 |
| AC7 | Existing hook suite passes                                                                                                                                                  | `python3 -m pytest scripts/test_husky_hooks.py -x -q` — 25 passed in 18.19s                                                                                                                                                                                                                                                                                                             | PASS                                                                                 |
| AC8 | \_git_env wrapper preserves positional overrides (CR finding)                                                                                                               | `test_git_env_wrapper_forwards_positional_as_overrides` — \_git_env({"GIT_AUTHOR_NAME": "fixture-author"}) applies as overrides, not base                                                                                                                                                                                                                                               | PASS                                                                                 |
| AC9 | push() decoy test exercises PrePushHookTests.push() path (CR finding)                                                                                                       | `test_push_isolates_from_inherited_git_env_with_decoy` added to PrePushHookTests class                                                                                                                                                                                                                                                                                                  | PASS                                                                                 |

## Review Round Fixes (CodeRabbit round 1)

### CR-1: `scripts/test_husky_hooks.py:58` — Preserve positional overrides in `_git_env`

- **Finding**: `_git_env = sanitized_git_env` bare alias passes positional arg as `base`, not `overrides`
- **Fix**: Replaced with wrapper function `def _git_env(overrides=None)` that forwards to `sanitized_git_env(overrides=overrides)`
- **Test**: `test_git_env_wrapper_forwards_positional_as_overrides` verifies positional dict goes to overrides

### CR-2: `scripts/test_husky_hooks.py:529` — Add push() decoy test to PrePushHookTests

- **Finding**: Existing decoy test at line 529 uses `git(target, "push", ...)`, not `self.push()` which has its own env sanitization path
- **Fix**: Added `test_push_isolates_from_inherited_git_env_with_decoy` to `PrePushHookTests` that uses `self.push()` with decoy Git vars
- **Test**: Confirms push() through PrePushHookTests strips GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE and decoy is unchanged

## Test Execution Evidence

```
$ python3 -m pytest scripts/test_husky_hooks.py -x -q --tb=short
.........................                                                 [100%]
25 passed in 18.19s
```

## Changed files

- `scripts/test_husky_hooks.py` — \_git_env wrapper fix + 2 new tests (push decoy in PrePushHookTests, \_git_env positional forwarding)

## Not user-facing

This is a test infrastructure change. No e2e-army test needed (`E2E: not needed — pure test fixture isolation, no user-facing flow`).
