# PR 64 review fixes - 2026-10-03

- Scope: owner-requested fixes for [PR #64](https://github.com/AbdelrhmanAh7/Mizano/pull/64), [issue #24](https://github.com/AbdelrhmanAh7/Mizano/issues/24), branch `demo/24-extraction-benchmark`, existing bench worktree.
- Provider: Codex, GPT-6 family; exact runtime model/version unavailable. No delegated provider or independent approval claimed.
- Baseline/tested checkout: `772f146835b6d670ca2713d173014e0329b7d285` plus uncommitted changes. Cached origin/master: `1d37f28ac87ba7ce6621fd09eb76664c51635eda`; current remote master and issue status could not be verified (GitHub 401; git schannel credentials unavailable).
- Initial worktree clean. No commit, push, GitHub post, database operation or deployment.
- Assigned local ownership: benchmark runner/scoring/specs, rules adapter/worker/spec, development docs, review lessons and this checkpoint. Session ownership released; no active worker started or persistent lease acquired.

## Threads

- PRRT_kwDORJJA9M6oh1ne FIXED: validate parsed label structure, synthetic flag and every required string/null field before corpus reads; reject unsupported money ground truth.
- PRRT_kwDORJJA9M6oh1nj FIXED: preflight all image languages/assets before extraction; reuse fail-closed local-only asset checks in RulesStrategy, including an unset directory.
- PRRT_kwDORJJA9M6oh1nl FIXED: metadata-only benchmark failure formatting and OCR error logging; regression tests exclude sensitive document values and paths.
- PRRT_kwDORJJA9M6oh1np FIXED: preserve original rules Decimal strings around the legacy numeric adapter, keep prediction precision in normalization and reject unsupported precision as a mismatch in exact/precision/recall metrics.
- PRRT_kwDORJJA9M6oh1nq FIXED: executable synthetic corpus command; optional flags documented in prose.

Root-cause search covered all files changed by this branch relative to cached origin/master and the rules adapter/worker used by the benchmark. New root causes added to review lessons. No organization queries or UI strings added.

## Validation

Commands below run from `apps/api`:

```powershell
pnpm.cmd exec tsc --noEmit --incremental false
pnpm.cmd exec eslint src/modules/ai/extraction/benchmark/run-benchmark.ts src/modules/ai/extraction/benchmark/run-benchmark.spec.ts src/modules/ai/extraction/benchmark/scoring.ts src/modules/ai/extraction/benchmark/scoring.spec.ts src/modules/ai/extraction/rules-strategy.service.ts src/modules/ai/extraction/rules-strategy.spec.ts --max-warnings 0
pnpm.cmd exec jest --runTestsByPath src/modules/ai/extraction/benchmark/scoring.spec.ts src/modules/ai/extraction/benchmark/run-benchmark.spec.ts src/modules/ai/extraction/rules-strategy.spec.ts --runInBand
```

- Final TypeScript: exit 0. Final ESLint: exit 0, zero warnings (six files).
- Final Jest: 3 suites, 51 tests passed, zero failed.
- Requested combination `--runInBand --maxWorkers=1` was attempted; Jest rejects both together before running tests. Used `--runInBand` for serial execution.
- Initial focused Jest run failed on a mock import and a test fixture rejected by the existing amount parser. Corrected import and injected an overprecision Decimal at the adapter boundary, without changing parser behavior or weakening assertions.
- PowerShell blocks pnpm.ps1; pnpm.cmd used without changing execution policy.
- No full suites, builds or ci:full run per owner instruction. Real OCR accuracy, Pi runtime and independent review remain unverified.

Next task: independent review of the uncommitted patch; owner decides commit/push and GitHub thread updates. Before integration, verify current remote state and follow the remaining release contract.
