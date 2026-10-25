# Evidence for #493 (supersedes part of #481)

AC1: with no country, the city fallback input is disabled and shows "Select a country first".
AC2: with a country lacking city data, the input is enabled and shows "Enter city name".
AC3: the `disabled` prop still disables the input.

Verified by `apps/web/components/ui/city-select.spec.tsx` (3 tests pass,
`npx jest components/ui/city-select.spec.tsx`). Master already contains the correct
`country ? ... : ...` branches and `disabled || !country`; the regression was only on
the parent branch ai/316, so this change adds the missing guard test, no code change.
Not user-facing change: no e2e-army test added.
