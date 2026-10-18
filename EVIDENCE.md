# Evidence — #182 (offset mapping slice). Sentry issue: none.

Command: `pnpm --filter api exec jest --maxWorkers=2 src/modules/ai/extraction` -> exit 0, 63 passed (run on this branch).
Lint: eslint --fix via the pre-commit lint-staged hook passed on the changed files.
| AC | Verified by |
|---|---|
| normalized equals normalizeDigits, map length equal | rules-normalize.spec.ts "matches normalizeDigits and keeps a bounded non-decreasing map" |
| map non-decreasing and in bounds | same test |
| `total ٤٢٠٠ USD` slices to `٤٢٠٠` | invoice-rules-extractor.spec.ts "slices Arabic-Indic digits" |
| emoji prefix shifts by 2 | "shifts by the emoji UTF-16 length" |
| ASCII identity | "is the identity for ASCII", "keeps ASCII spans identical" |
| 0 <= start < end <= length | "keeps ASCII spans identical and inside the text" |
Regression-on-base: the new specs import symbols/fields that do not exist on base, so they cannot pass there; no base run was recorded.
Not covered: async T3 path, PDF fixtures (see AI_QUESTIONS.md).
