# Issue #462 — verification report and PR handoff

## Problem and resulting behavior

Supersedes part of #417.

The Supertest namespace import has no call signature under `esModuleInterop`.
Use `import request = require('supertest')` to retain the callable CommonJS type
and runtime value under both compiler modes. This syntax is explicitly allowed
by the issue; a default import alone would break the current non-interop runtime.
Reuse the installed Supertest and TypeScript packages; no new dependency.

## Linked issue and owned scope

- Issue: <https://github.com/AbdelrhmanAh7/Mizano/issues/462>
- Origin: <https://github.com/AbdelrhmanAh7/Mizano/pull/417#discussion_r4353648222>
- Sentry: no originating Sentry issue is supplied in #462 or its comments.
- Base: `b63bb4e3f11c787658bfa870447d24b292a5830b` (fetched `origin/master`).
- Tested code head: `fac2ed2504d040af581560079b21e57bf80a3506`.
- Scope: test import, compiler regression test/config, and review lesson only.
- Callers: `request(app.getHttpServer())` in the forwarded-IP test and `loginFrom`;
  both run in the existing guard suite. Production code is unchanged.

## ACCEPTANCE CRITERIA

1. **AC1:** The actual throttler HTTP spec compiles with `esModuleInterop: true`;
   a regression check rejects the base import with TS2349 and accepts the fix.
2. **AC2:** All existing guard, trusted-proxy and HTTP throttling assertions pass
   under the repository compiler mode and under interop mode.
3. **AC3:** Supply a report mapping each criterion to observed evidence, identify
   covering tests, link the originating finding, and state “Supersedes part of #417”.

## VERIFICATION REPORT

All results were observed locally in this session. Commands run from repo root.

| AC  | Check                                                       | Observed result                                                                                         | Exit     |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| AC1 | C1 with the base spec restored, new regression test present | 1 test failed; two TS2349 diagnostics at the real HTTP call sites                                       | 1        |
| AC1 | C2 on the base spec                                         | TS2349 at lines 234 and 259; compiler exit 2                                                            | 1 (pnpm) |
| AC1 | C1 on tested code head                                      | 1 regression + 25 guard tests passed, 0 failed                                                          | 0        |
| AC1 | C2 on tested code head                                      | No compiler diagnostics                                                                                 | 0        |
| AC2 | C1 on tested code head                                      | 2 suites passed; 26 tests passed, 0 failed                                                              | 0        |
| AC2 | C3 on tested code head                                      | 25 tests passed, 0 failed, with interop enabled                                                         | 0        |
| AC3 | Report content and `git diff --check`                       | Numbered ACs, commands, origin, covering tests and supersession statement present; no whitespace errors | 0        |

```sh
# C1
nice -n 10 pnpm --filter api exec jest --runInBand --runTestsByPath src/throttler-ip.guard-interop.spec.ts src/throttler-ip.guard.spec.ts
# Base red run selected only src/throttler-ip.guard-interop.spec.ts.

# C2
nice -n 10 pnpm --filter api exec tsc -p test/tsconfig.throttler-interop.json

# C3
nice -n 10 pnpm --filter api exec jest --runInBand --runTestsByPath src/throttler-ip.guard.spec.ts --transform '{"^.+\\.(t|j)s$":["ts-jest",{"tsconfig":"test/tsconfig.throttler-interop.json"}]}'
```

For base comparison, saved the head spec bytes, restored that file from
`git show b63bb4e3:apps/api/src/throttler-ip.guard.spec.ts`, ran the regression
test, and restored the head bytes in a Python `finally` block. No other tracked
base code differs. The final regression test was rerun red this way before the fix
commit, and green after the commit. The regression checks diagnostics from the
actual spec, not a copied import snippet, and asserts that the target is included.

Changed covering tests: new `apps/api/src/throttler-ip.guard-interop.spec.ts`,
configured by `apps/api/test/tsconfig.throttler-interop.json`;
`apps/api/src/throttler-ip.guard.spec.ts` changes only its import and retains
all 25 existing assertions/cases.

## Validation evidence and limitations

- `pnpm --filter api lint`: exit **0**, no errors/warnings, on tested code head.
- `pnpm --filter api type-check`: exit **1**, on base and tested code head.
  Missing `@mizano/shared-types` declarations cause TS2307 in the exception filter,
  logger controller/gateway/service and specs, and VAT draft service. Logger service
  also reports TS2322 at line 309 and TS18046 at line 311. This is a reproduced
  baseline/environment failure, not a passing package typecheck. The script stops
  before its second (E2E config) compiler command.
- Initial sandbox C1 run: exit **1**, 24 passed/2 failed when Supertest could not
  bind a socket (`serverAddress`/null `address`). Rerunning with local socket
  permission produced the 26/26 result above. Sandboxed `nice` also reported
  `setpriority: Operation not permitted`; successful HTTP reruns used host permissions.
- An earlier C3 run using `--globals` passed 25 tests but emitted a ts-jest
  deprecation warning; the reported C3 uses the supported transform option.
- Full suite/build: not run locally, per owner instruction; CI remains pending.
- E2E: not needed — test-only import/compile regression, identical product behavior.
  No UI changes; screenshots and Arabic RTL/LTR journeys are not applicable.
- Author/provider: OpenAI Codex session, high reasoning; exact model version is not
  exposed by the session. Independent review has not run; harness review is pending.
- Skills: using-superpowers, model-effort-routing, diagnosing-bugs,
  systematic-debugging, test-driven-development, typescript-best-practices,
  principle-type-system-discipline, verification-before-completion, humanizer, pr.

## Demo delivery and next action

No financial, tenancy, migration, runtime or deployment change. Rollback is a
revert of test tooling. No production deployment is needed. Branch `ai/462` is
ready for the harness to push and open its PR with this report attached; no PR
was opened or pushed by this session. Dispatcher owns the issue lease; this
implementer has stopped editing. Next: CI package typecheck/full gates and an
independent review of the exact head. Merge acceptance remains pending those gates.
