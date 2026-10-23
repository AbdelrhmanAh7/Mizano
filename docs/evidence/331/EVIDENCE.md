# Evidence for Issue #331

## Summary

Fixed the session-shape e2e test (`e2e-army/252-session-shape.e2e.ts`) to honor non-default test users via `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` overrides. Previously, the test accepted credential overrides but always asserted seed-specific literals (`user-admin`, `seed-org-001`, `Admin`), causing valid non-default users to fail.

## Changes Made

### 1. New Helper Library: `e2e-army/lib/session-expectations.ts`

- Pure, network-free function `buildSessionExpectation(env)` that decides between seed/override mode
- Pure function `assertSessionMatches(user, expectation)` with clear field-level error messages
- Exported constants: `SEED_EMAIL`, `SEED_USER`
- No new runtime or dev dependencies added

### 2. Unit Tests: `e2e-army/lib/session-expectations.test.ts` (24 tests)

**Override Mode Tests (US1):**

- Non-seed email → override mode
- All six fields expect non-empty strings
- Email matches override (trimmed, case-insensitive)
- No seed literals in serialized expectation

**Seed Mode Tests (US2):**

- Unset/empty/whitespace email → seed mode
- Seed email with different case/whitespace → seed mode
- Only password overridden → seed mode
- Exact seed literals asserted in seed mode

**Assertion Tests:**

- Missing/empty fields fail with field name
- Arabic/unicode names accepted in override mode
- Missing user fails with clear message (no TypeError)
- Seed mode: altering any single field fails with field name

### 3. Updated E2E Test: `e2e-army/252-session-shape.e2e.ts`

- Imports helper functions
- Replaces hard-coded seed assertions with `assertSessionMatches(session.user, expectation)`
- Default mode (no override) still asserts exact seed values for regression coverage
- Override mode asserts shape + email match

## Acceptance Criteria Verification

| AC     | Requirement                                                                  | Verified By                                                                  |
| ------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FR-001 | Decide seed/override using effective login email (trimmed, case-insensitive) | Unit tests: seed mode cases + override mode case                             |
| FR-002 | Seed mode asserts exact seed values for all 6 fields                         | Unit test: "expects exact seed literals in seed mode" + seed mode assertions |
| FR-003 | Override mode asserts non-empty strings + email match                        | Unit tests: override mode cases                                              |
| FR-004 | Override mode asserts NO seed literals                                       | Unit test: "contains no seed literals in override mode"                      |
| FR-005 | Pure network-free function with unit test                                    | `buildSessionExpectation` + `assertSessionMatches` + 24 unit tests           |
| FR-006 | Failure messages name field, never include password                          | All assertion tests verify field names; password never used                  |
| FR-007 | No new dependencies                                                          | Only uses existing Jest/`expect` matchers                                    |

## Test Results

```
PASS lib/session-expectations.test.ts
  buildSessionExpectation
    override mode
      ✓ returns override mode for a non-seed email
      ✓ expects non-empty strings for all six seed fields in override mode
      ✓ expects email to match the override (trimmed, case-insensitive)
      ✓ contains no seed literals in override mode
    seed mode
      ✓ returns seed mode when E2E_USER_EMAIL is unset
      ✓ returns seed mode when E2E_USER_EMAIL is empty string
      ✓ returns seed mode when E2E_USER_EMAIL is whitespace
      ✓ returns seed mode when E2E_USER_EMAIL equals seed email (different case)
      ✓ returns seed mode when E2E_USER_EMAIL equals seed email (with whitespace)
      ✓ returns seed mode when only E2E_USER_PASSWORD is overridden
      ✓ expects exact seed literals in seed mode
  assertSessionMatches
    ✓ fails with field name when a required field is missing
    ✓ fails with field name when a required field is empty
    ✓ passes for a valid override user with Arabic names
    ✓ fails with clear message when user is missing
    ✓ fails with clear message when user is undefined
    seed mode assertions
      ✓ passes for exact seed user
      ✓ fails when id is altered
      ✓ fails when name is altered
      ✓ fails when firstName is altered
      ✓ fails when lastName is altered
      ✓ fails when organizationId is altered
      ✓ fails when role is altered
      ✓ fails when email is altered

Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```

## Type Check

```
$ npx tsc --noEmit --skipLibCheck lib/session-expectations.ts lib/session-expectations.test.ts
# No errors
```

## Prettier Format

```
$ npx prettier --check e2e-army/lib/ e2e-army/252-session-shape.e2e.ts
# All matched files use Prettier code style!
```

## Commits

- `3d2847c6` test(e2e-army): add session-expectations helper with unit tests for #331
- `719b2e0c` test(e2e-army): rewire 252-session-shape to use session-expectations helper for #331

## Related Issues

- Fixes #331 (follow-up from #274, split from #242, origin PR #252)
- QA Second Opinion [p2] finding addressed
