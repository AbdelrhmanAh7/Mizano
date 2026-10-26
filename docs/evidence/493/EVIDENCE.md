# Evidence for #493 (supersedes part of #481)

AC1: with no country, the city fallback input is disabled and shows "Select a country first".
AC2: with a country lacking city data, the input is enabled and shows "Enter city name".
AC3: the `disabled` prop still disables the input.

Master already contains the correct `country ? ... : ...` branches and `disabled || !country`
(`apps/web/components/ui/city-select.tsx:46-47`); the regression was only on the parent branch
ai/316, so this change adds the missing guard test and no component code change.
Not a user-facing change: no e2e-army test added.

## Tested commit

Tested SHA: `3e0ec6d8e787e626a22c9f9e32163cdcfea39e33` (branch head before this docs-only commit;
the evidence commit changes no code).

## Commands and observed output

`cd apps/web && npx jest components/ui/city-select.spec.tsx` — Jest reported 3 passed:

```
PASS components/ui/city-select.spec.tsx
  CitySelect fallback input
    ✓ is disabled with "Select a country first" when no country is chosen (29 ms)
    ✓ is enabled with "Enter city name" for a country without city data (2 ms)
    ✓ stays disabled when the disabled prop is set (2 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

| AC  | Test                                                                  |
| --- | --------------------------------------------------------------------- |
| AC1 | `is disabled with "Select a country first" when no country is chosen` |
| AC2 | `is enabled with "Enter city name" for a country without city data`   |
| AC3 | `stays disabled when the disabled prop is set`                        |

## Regression check

Temporarily changing line 46 to the broken ternary
`country ? 'Enter city name' : 'Enter city name'` (the ai/316 bug) made the AC1 test fail
(`Tests: 1 failed, 2 passed, 3 total`). Reverting restored `3 passed`. The mutation was not committed.

## Lint / type-check

- `pnpm lint --file components/ui/city-select.spec.tsx`: no ESLint warnings or errors.
- `pnpm type-check` (apps/web) exits 2 with errors in files this change does not touch
  (`customer-form.spec.ts`, `@mizano/shared-types` not resolved in this worktree).
  Not caused by this change; none are in `city-select*`.
