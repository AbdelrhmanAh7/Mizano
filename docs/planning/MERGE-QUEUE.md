# Merge Queue Audit — Oldest 6 Open Pull Requests

Audit performed for issue #95 on the 6 oldest open PRs in `AbdelrhmanAh7/Mizano` against `master` (`b83d72b`). Full audit evidence, test commands, and captured outputs are recorded in [EVIDENCE-95.md](EVIDENCE-95.md).

## Queue Audit Table

| PR                                                     | Branch                         | Tested SHA                                 | Tests                       | Domain Risks (Decimal / Isolation / Idempotency / RTL)                                                        | Conflicts vs Master       | Verdict   |
| ------------------------------------------------------ | ------------------------------ | ------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- | --------- |
| [#58](https://github.com/AbdelrhmanAh7/Mizano/pull/58) | `demo/20-telegram-intake`      | `2b3f01c3d7e9fe4877bb29b8af903437b3eee92a` | PASS (3 suites, 74 tests)   | Low risk. Tenant-scoped `chatId`, link codes hashed SHA-256 with 15m TTL. Intake deduped. Full AR/EN replies. | None                      | **FIX**   |
| [#60](https://github.com/AbdelrhmanAh7/Mizano/pull/60) | `demo/38-arm64-images`         | `d01e25239b4a3a62c1034a0258c53e614655ed69` | PASS (17 suites, 284 tests) | Low risk. Deterministic rules extraction; memory/CPU limits via `prlimit`; pinned Tesseract assets. Draft PR. | None                      | **FIX**   |
| [#65](https://github.com/AbdelrhmanAh7/Mizano/pull/65) | `demo/followup-vat`            | `5eb0340b0e002730f52709d3a7ad8a6097203f77` | PASS (4 suites, 75 tests)   | Low risk. 4-dp Decimal transport; `tax.submit` permission scoped; chronological bulk submit; AR/EN settings.  | None                      | **MERGE** |
| [#66](https://github.com/AbdelrhmanAh7/Mizano/pull/66) | `demo/followup-reports-ledger` | `310ac2b1aa7129b4c51403f46eb6ee36f4d1e778` | PASS (6 suites, 79 tests)   | Medium risk. Receivables aging rebuilt as-of cutoff. Gap: payables aging still uses current `balanceDue`.     | None (Conflicts with #68) | **FIX**   |
| [#67](https://github.com/AbdelrhmanAh7/Mizano/pull/67) | `demo/followup-sales-banking`  | `be7478f715f1e0f0efb8447e922db9d79d37fbc1` | PASS (8 suites, 104 tests)  | Low risk. Cumulative Decimal VAT split; date-aware refund coverage; `@InvalidatesLedger`; Draft PR.           | None                      | **MERGE** |
| [#68](https://github.com/AbdelrhmanAh7/Mizano/pull/68) | `demo/followup-org-currency`   | `7c632bdf74832cfc94f97cb49c196d168e99127f` | PASS (4 suites, 104 tests)  | Low risk. Removed USD hardcoding; reports use API `currencyCode`; org-scoped base-currency lookup; Draft PR.  | None (Conflicts with #66) | **MERGE** |

---

## Detailed PR Findings & Actionable gh Commands

### 1. PR #58 — `feat(intake): telegram long-polling ingestion into intake jobs`

- **Verdict**: **FIX**
- **Findings**: Tests pass (`telegram.client`, `telegram-link.service`, `telegram-intake.service`). Domain scoping and bilingual messaging are sound. However, `apps/api/prisma/schema.prisma` was checked in with CRLF line endings (+3,133 / -3,059 lines in diff), violating the LF repository rule.
- **Remediation**: Normalize line endings in `apps/api/prisma/schema.prisma` to LF and rebase onto master.
- **Copy-paste command**:
  ```bash
  gh pr comment 58 --body "Line endings in apps/api/prisma/schema.prisma were committed with CRLF (+3133/-3059 lines). Please normalize schema.prisma to LF (core.autocrlf=false) and rebase on master."
  ```

### 2. PR #60 — `build: cross-built multi-arch api and web images for the pi`

- **Verdict**: **FIX**
- **Findings**: Intake unit tests pass (17 suites, 284 tests). Worker isolation and resource constraints conform to the CPU-only extraction spec. Still marked as DRAFT awaiting CI arm64 multi-arch build verification and real Raspberry Pi 5 performance benchmarks.
- **Remediation**: Complete arm64 verification and latency/memory metrics on Pi hardware, then mark ready for review.
- **Copy-paste command**:
  ```bash
  gh pr comment 60 --body "Local intake suites pass (17 suites, 284 tests). Keep in draft until arm64 container verification and Pi 5 runtime metrics (latency, cgroup RAM) are completed."
  ```

### 3. PR #65 — `fix(tax): vat submit permission, dated bases, chronological bulk submit`

- **Verdict**: **MERGE**
- **Findings**: All unit suites pass (75 tests), lint clean. CodeRabbit findings on legacy invoices and shipping deduction are resolved (confirmed in commit `5eb0340`). Decimal string formatting and `tax.submit` permission scoping verified.
- **Remediation**: Approve PR and merge via squash.
- **Copy-paste command**:
  ```bash
  gh pr review 65 --approve --body "Validated locally at 5eb0340: tax and default-roles unit suites pass (75 tests), lint clean, Decimal string transport verified, CodeRabbit findings resolved."
  # To merge:
  # gh pr merge 65 --squash --delete-branch
  ```

### 4. PR #66 — `fix(reports): as-of aging, ledger bank balances, locked producers`

- **Verdict**: **FIX**
- **Findings**: Receivables aging correctly rebuilds balances as of the cutoff date, and ledger locks are enforced across asset/work-order/payroll services. However, `getPayablesAging` still filters by current `balanceDue`, leaving payables aging vulnerable to post-cutoff settlement skew (CodeRabbit major finding).
- **Remediation**: Rebuild payables aging from dated bill and payment events as of cutoff (mirroring receivables aging logic) and add regression test.
- **Copy-paste command**:
  ```bash
  gh pr comment 66 --body "Validated at 310ac2b: unit suites pass (79 tests). Outstanding fix: getPayablesAging needs to rebuild historical balances from dated events as of cutoff rather than filtering current balanceDue."
  ```

### 5. PR #67 — `fix(sales): refund coverage by date, recurring keys, ledger caches`

- **Verdict**: **MERGE**
- **Findings**: Tests pass (API 88 tests, Web 16 tests). Implements robust date-aware refund coverage check preventing backdated refund deficits, cumulative Decimal VAT splitting, and append-only audit log keys for recurring runs. Currently draft.
- **Remediation**: Mark ready for review and trigger CodeRabbit review.
- **Copy-paste command**:
  ```bash
  gh pr ready 67
  gh pr comment 67 --body "@coderabbitai review"
  # To merge after review:
  # gh pr merge 67 --squash --delete-branch
  ```

### 6. PR #68 — `fix(web): report currency from the api, base-currency lookup`

- **Verdict**: **MERGE**
- **Findings**: Tests pass (API 26 tests, Web 78 tests). Eliminates USD fallback across 10 report views, implements secure tenant-scoped base currency lookup, and adds bilingual report labels. Currently draft. Note: touches aging reports files that overlap with PR #66.
- **Remediation**: Mark ready for review; rebase if PR #66 merges first.
- **Copy-paste command**:
  ```bash
  gh pr ready 68
  gh pr comment 68 --body "@coderabbitai review"
  # To merge after review:
  # gh pr merge 68 --squash --delete-branch
  ```
