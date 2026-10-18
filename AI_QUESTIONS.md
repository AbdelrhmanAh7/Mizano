# AI_QUESTIONS — #219 [e2e] Authentication and sessions failing on master

## 1. The failing assertion was a hub test bug, already fixed in the hub

The gate failed on `expect(JSON.stringify(weak.body.message)).toMatch(/uppercase/i)` in
`[mz-auth.3]`. The API never put the constraint texts in `message`.
`AllExceptionsFilter.handleHttpException` (`apps/api/src/common/filters/http-exception.filter.ts`)
has always set `message: 'Validation failed'` and `code: 'VALIDATION_ERROR'`, with the
class-validator texts in `details`.

The hub changed that assertion in commit `0ea3e8c` ("fix(e2e-army): Mizano stable gate test bugs
(error shape, …)"). It now asserts `code === 'VALIDATION_ERROR'` and checks `details` for
`/uppercase/i`. The stable run of 2026-10-17 (`~/agents/logs/stable/Mizano/2026-10-17`) reports
`mz-auth` **passed**, with `[mz-auth.3]` green in 298 ms.

This PR therefore changes no product code. It adds regression tests that lock the contract the gate
depends on, so a later change to the filter or `RegisterDto` cannot silently break `mz-auth` again.

## 2. Acceptance criteria 3 and 4 in the drafted spec are wrong

The spec section was drafted by a free model. It asks for the message to read **"Validation Failed"
(Title Case)**. That conflicts with the contract the hub gate now asserts. The hub test's own comment
reads: `message "Validation failed", the constraint texts in details`. Other API callers also match
`'Validation failed'` (for example `import.service.ts` and `i18n/en/common.json`). Changing the casing
would not fix anything and could break those callers, so I did not change it. The tests assert the
existing casing, `'Validation failed'`.

AC4 ("Unauthorized" for an invalid JWT) already holds. The 401 body's `error` is `'Unauthorized'`;
the new tests assert this.

The spec also names `auth.controller.ts`, `auth.service.ts` and `jwt-auth.guard.ts` as files to
change. None needed a change.

## 3. Follow-up (not in this PR): password rules hide each other

`RegisterDto.password` has three `@Matches` decorators (uppercase, lowercase, digit).
class-validator stores constraints keyed by type, so a field reports at most one `matches` message.
`'alllowercase'` (no uppercase **and** no digit) reports only the uppercase rule. `'ALLUPPER'` reports
only the lowercase rule, and the missing digit is never mentioned. Users fix one rule and then hit
the next one. Suggested fix: give each rule its own constraint name (a small custom validator, or one
`@Matches` with a combined message). This is a separate issue. It does not affect the gate, because
`alllowercase1` fails only the uppercase rule.
