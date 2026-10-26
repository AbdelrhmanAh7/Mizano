# Evidence for #493 (supersedes part of #481)

1. **AC1:** with no country, the city fallback input is disabled and shows "Select a country first".
2. **AC2:** with a country lacking city data, the input is enabled and shows "Enter city name".
3. **AC3:** the `disabled` prop still disables the input.

Master already contains the correct `country ? ... : ...` branches and `disabled || !country`
(`apps/web/components/ui/city-select.tsx:46-47`); the regression was only on the parent branch
ai/316, so this change adds the missing guard test and no component code change.
Not a user-facing change: no e2e-army test added.

## VERIFICATION REPORT (2026-10-26)

Tested SHA: `4120461c688a7722f40fea5eec8fc9d4990d42ca` (rerun 2026-10-26 on this head, after the
`e7a4d795` run; later commits change docs only, no code).

## Commands and observed output

`nice -n 10 pnpm --filter @mizano/web exec jest components/ui/city-select.spec.tsx --runInBand` — Jest reported 3 passed (nice also printed `setpriority: Operation not permitted`):

```
PASS components/ui/city-select.spec.tsx
  CitySelect fallback input
    ✓ is disabled with "Select a country first" when no country is chosen (24 ms)
    ✓ is enabled with "Enter city name" for a country without city data (1 ms)
    ✓ stays disabled when the disabled prop is set (1 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

Output above is from the rerun on `4120461c`. The command was piped through `tail`, so the shell
exit code was not captured for this rerun; the Jest summary shows no failures.

| AC  | Test                                                                  |
| --- | --------------------------------------------------------------------- |
| AC1 | `is disabled with "Select a country first" when no country is chosen` |
| AC2 | `is enabled with "Enter city name" for a country without city data`   |
| AC3 | `stays disabled when the disabled prop is set`                        |

## Regression check

Previous implementer reported (not rerun in this documentation follow-up): temporarily changing line 46 to the broken ternary
`country ? 'Enter city name' : 'Enter city name'` (the ai/316 bug) made the AC1 test fail
(`Tests: 1 failed, 2 passed, 3 total`). Reverting restored `3 passed`. The mutation was not committed.

## Lint / type-check

- `pnpm lint --file components/ui/city-select.spec.tsx`: no ESLint warnings or errors.
- `pnpm type-check` (apps/web) exits 2 with errors in files this change does not touch
  (`customer-form.spec.ts`, `@mizano/shared-types` not resolved in this worktree).
  Not caused by this change; none are in `city-select*`.

## Review follow-up / handoff

- Changed covering test: `apps/web/components/ui/city-select.spec.tsx`; AC1–AC3 map to the passing tests above. This commit changes documentation only.
- `pnpm --filter @mizano/web lint`: exit 0, warnings in unrelated files. `pnpm --filter @mizano/web type-check`: wrapper exit 1 / tsc exit 2; unresolved `@mizano/shared-types` and `@mizano/validators`, plus logger/customer-form errors; no city-select diagnostics. Full suite/build left to CI per owner rule.
- Base `origin/master` is `4770ea7905fa2d21bc51d82da4683f82ad701bba`; `git show origin/master:apps/web/components/ui/city-select.tsx` (exit 0) confirms the correct placeholder and disabled branches already exist. A failing regression test on this base cannot honestly be claimed.
- E2E: not needed — only regression coverage/documentation added; runtime UI is unchanged. Playwright screenshots and Arabic RTL/LTR were not run. Originating Sentry issue: none supplied in #493; source is [the parent PR finding](https://github.com/AbdelrhmanAh7/Mizano/pull/481#issuecomment-6367197899).
- Supersedes part of #481. [Issue #493](https://github.com/AbdelrhmanAh7/Mizano/issues/493), [PR #539](https://github.com/AbdelrhmanAh7/Mizano/pull/539). Provider: OpenAI Codex (exact model version not exposed; selected effort: medium); skills: model-effort-routing, using-superpowers, receiving-code-review, diagnosing-bugs, systematic-debugging, verification-before-completion, humanizer. No independent approval claimed; no lease created; hand back to harness for PR evidence attachment, checks and review. No push performed.
