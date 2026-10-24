# Issue #446 verification report

Supersedes part of #363. Origin: [#446](https://github.com/AbdelrhmanAh7/Mizano/issues/446), [review finding](https://github.com/AbdelrhmanAh7/Mizano/pull/363#discussion_r4354473783).
Originating Sentry issue: none supplied; this is a review finding.

Base commit: `cd54509bb96dcd099b634d2335e947d6102ba446` (fetched `origin/master`).
Tested code head: `b6bf36b0db2e329f16c13041471841a38780112d`.
Subsequent evidence-only commits do not change either executable file below.

## Acceptance criteria

1. **AC1:** After UI login, fetch `/api/auth/session` and require its non-empty `user.firstName` in the exact dashboard greeting.
2. **AC2:** Match the selected login email and session name, without assuming the user is Admin. Names containing regex punctuation must work literally.
3. **AC3:** Check English/LTR and Arabic/RTL greetings, capture screenshots, and demonstrate rejection of generic/wrong greetings and invalid sessions.

## Scope and changed covering tests

- Added `e2e-army/446-session-greeting.e2e.ts`, tagged `@issue-446`, AC1–AC3, `feat:mz-auth`, `lvl:ui`.
- Added [verify-fixtures.mjs](verify-fixtures.mjs), a reproducible assertion probe using a disposable HTTP fixture and the installed e2e/Playwright engine. It does not authenticate against Mizano or use a database/model.
- Current master has no `361-session-shape.e2e.ts`; no parent branch was reused. The parent PR's current test hard-codes Admin. The replacement fetches identity before checking the greeting.
- Production code and user flows are unchanged. No production callers/orchestrators require updates. Existing runner packages `e2e@0.18.0` and `@e2e-dev/web@0.13.0` were reused; no dependencies were added.
- Test value: protects session-to-greeting identity; fails on missing/wrong names; existing master has no equivalent session greeting test. Green fixture runs do not prove application authentication works.

## VERIFICATION REPORT

All browser observations below are **fixture-only**, not application acceptance. Each probe runs one test with one worker, zero retries and no model calls.

| AC       | Command/scenario                                   | Observed exit | Result                                              |
| -------- | -------------------------------------------------- | ------------- | --------------------------------------------------- |
| AC1, AC2 | Parent PR UI test, correct non-admin fixture       | 1             | Reproduced hard-coded Admin locator failure         |
| AC1, AC2 | Head test, `correct 'Amina [QA].*'`                | 0             | Exact session-derived greeting accepted             |
| AC2      | Head test, `correct Admin`                         | 0             | Seed-name compatibility                             |
| AC2, AC3 | Head test, `correct ليلى`                          | 0             | Arabic first name accepted in both locales          |
| AC1, AC3 | Head test, `wrong`                                 | 1             | Wrong greeting rejected at heading assertion        |
| AC1, AC3 | Head test, `generic`                               | 1             | Greeting without name rejected at heading assertion |
| AC1, AC3 | Head test, `empty`                                 | 1             | Empty firstName rejected before heading assertion   |
| AC1, AC3 | Head test, `http-error`                            | 1             | Failed session request rejected                     |
| AC3      | Document direction assertions in every correct run | 0             | English `ltr`, Arabic `rtl`                         |
| AC1–AC3  | Live Mizano `e2e-army` run                         | Not run       | PENDING: requires harness throwaway stack           |

Probe invocation (mode/name are the table inputs):

```sh
nice -n 10 node docs/evidence/446/verify-fixtures.mjs e2e-army/446-session-greeting.e2e.ts correct 'Amina [QA].*'
```

For the red run, the exact parent source was fetched from `31d53f0d6d496a5b094ba0a43c6179bd6e6298bc`, path `e2e-army/361-session-shape.e2e.ts`, blob `ebce71ef71681acb1c8f4cd10d7b1e4e86a582a2`, into `/tmp/mizano-446-check/parent-361.e2e.ts`:

```sh
E2E_FIXTURE_GREP='login UI form' nice -n 10 node docs/evidence/446/verify-fixtures.mjs /tmp/mizano-446-check/parent-361.e2e.ts correct 'Amina [QA].*'
```

The first failing locator was `getByText(/Welcome back, Admin/i)`, observed match count 0. The same non-admin fixture passed with the head test. This is a red/green comparison against the originating **parent test**, not a claim that current master has a failing application test; master lacks that test.

### Screenshots

Actual Playwright-backed fixture captures: [English/LTR](fixture-en-ltr.png), [Arabic/RTL](fixture-ar-rtl.png). These show the assertion fixture, **not the Mizano UI**. Application screenshots remain PENDING with the live run.

### Static checks

`CHECK_DIR` below is the probe output directory `/var/folders/ht/4kkc2fg11lx4jlbhby0nnbkw0000gn/T/mizano-446-gsUOWJ`. Its copied test matches the committed source. The runner owns the e2e dependencies; no workspace package was changed.

```sh
nice -n 10 pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM --typeRoots ./node_modules/@types --types node "$CHECK_DIR/446.e2e.ts"
pnpm exec eslint --no-eslintrc --parser @typescript-eslint/parser --plugin @typescript-eslint --env node,es2022 --parser-options '{"sourceType":"module","ecmaVersion":2022}' --rule '@typescript-eslint/no-explicit-any:error' --rule '@typescript-eslint/no-unused-vars:error' e2e-army/446-session-greeting.e2e.ts docs/evidence/446/verify-fixtures.mjs
node --check docs/evidence/446/verify-fixtures.mjs
```

Observed exits: TypeScript 0; ESLint 0; Node syntax 0. Direct TypeScript resolution from the repo with `--baseUrl` pointed at runner modules failed with exit 2 (unresolved e2e imports); type-checking the identical copied file beside the runner dependencies succeeded. The sandbox rejected lowering process priority; elevated browser probes used `nice -n 10` successfully.

## Remaining validation and handoff

Live E2E/CI and independent exact-head review are PENDING. Port 5001 belongs to a production release and was not tested. The documented throwaway-stack launcher builds the app; the task prohibits full local builds/suites, so the harness must run the app gate and collect application screenshots. No full suite/build was run, no CI config was changed, and no push/PR creation/merge was attempted.

Provider: OpenAI Codex, current harness session; exact runtime model/version is not exposed. Routing choice: high effort for diagnosis and integration; no additional AI runs launched. Node `v26.10.0`, pnpm `8.14.0`, macOS arm64.

Skills used: model-effort-routing, diagnosing-bugs, systematic-debugging, receiving-code-review, test-driven-development, test-audit (provided pack), typescript-best-practices, principle-type-system-discipline, principle-test-behavior-not-implementation, verification-before-completion, humanizer, pr, and the supplied e2e-army/test-first instructions.
