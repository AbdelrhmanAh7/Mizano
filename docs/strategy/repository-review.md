# Mizano repository review and demo strategy

Reviewed: 5 September 2026. Baseline: [`f8bf699319a37198b585cb67b650069da4c6cd4d`](https://github.com/AbdelrhmanAh7/Mizano/commit/f8bf699319a37198b585cb67b650069da4c6cd4d), default branch `master`; commit timestamp 29 March 2026. Audience: product owner and engineering/accounting reviewers.

## Executive decision

Keep the existing stack, pause peripheral module expansion and deliver one accountant-led invoice workflow in ten days. The most consequential defects are financial integrity and tenant isolation; adding a stronger vision model would not resolve them. Use native parsing and local CPU OCR with explicit field rules and source evidence, backed by a durable job queue. Telegram and web must call the same intake service.

The repository has substantial application code, a Decimal schema, reusable Next.js/NestJS components, Arabic/English scaffolding and many unit tests. These are useful foundations. Its broad module catalogue and successful CI do not establish that the connected accountant workflow is ready.

## Scope and limits

This is a repository-wide architecture/inventory review plus focused static review of the invoice, auth, accounting, security, document, UI and delivery paths. It is **not a line-by-line audit of every module**. Files were read from the pinned GitHub snapshot. No running Mizano server, database, customer invoices or CPU benchmark was available. Application unit/E2E suites were not run in this review environment; historical CI evidence is separate. No claim of comprehensive vulnerability absence, live exploit, regulatory certification or achieved extraction accuracy is made.

GitHub initially returned no issues and no open PRs. The latest baseline [CI run](https://github.com/AbdelrhmanAh7/Mizano/actions/runs/23718641614) and [deployment run](https://github.com/AbdelrhmanAh7/Mizano/actions/runs/23718725622) were successful. Earlier deployments failed. Those March results do not verify September runtime health. Reading repository rulesets returned a plan-related 403; branch protection was not established from that result.

## Findings to reproduce and fix

Evidence paths below use module-relative shorthand (`ai`, `purchases`, `sales` under `apps/api/src/modules`; web paths under `apps/web`) and refer to the baseline. P0 means blocks this demo; it is not a CVSS score. Findings are static unless explicitly stated otherwise. The corresponding task keys are in [the planning manifest](../planning/demo-plan.json).

| Task | Priority | Evidence | Consequence and required change |
| --- | --- | --- | --- |
| AUTH | P0 | `apps/web/lib/auth.ts`: module-global `refreshPromise` and `refreshCooldownUntil`; every caller consumes the same resolved token object | Concurrent refresh requests for different users can receive the first user's tokens. Key single-flight/cooldown by session and prove two-user concurrency isolation. |
| TENANT | P0 | `ai/controllers/document-intake.controller.ts`: public SSE and result reads by jobId; `IntakeJob` has no owner. `JwtAuthGuard` returns true for `@Public`; `PermissionsGuard` permits routes without permission metadata | A valid job ID is not authorization. Require authenticated tenant-bound SSE/polling and owner persistence. No anonymous runtime exploit was attempted. |
| TENANT | P0 | `purchases/services/payments-made.service.ts` validates vendor but not each allocated bill; `bills.service.ts:updateBalance` reads by ID. Related project/account replacements also lack visible tenant validation | Validate every referenced entity before any read/write; two-tenant tests must assert rejection and unchanged balances. Ordinary schema foreign keys do not encode tenant ownership. |
| MONEY | P0 | `ai/services/document-intake.service.ts:createDraftBill/createDraftInvoice` adds taxRate directly; `purchases/bills/scan/page.tsx` maps taxAmount into taxRate; manual bill path uses percentage | Two units at 100 with 14% tax should give 228, but scan service given percentage 14 gives 214. The UI sometimes passes amount instead, masking one case and corrupting rate semantics. Introduce distinct rate/amount fields and one Decimal calculator. |
| POSTING | P0 | `bills.service.ts:approve` creates journal then updates bill separately; `payments-made.service.ts:create` commits payment before balances/journal; `schema.prisma:Journal.isPosted` defaults true | Failure or concurrent approval can duplicate/partially commit posted accounting. Require atomic state transitions and unique source-event posting keys. Missing accounting defaults must not silently omit journal creation. |
| BULK | P0 | `bills.service.ts:bulkApprove/bulkPay` changes status/balance only; `journals.service.ts:bulkPost` skips period checks | Batch actions can claim approval/payment without corresponding financial records. Route bulk operations through the same guarded commands as single operations. |
| BULK | P0 | `journals.service.ts:update/remove` lacks posted immutability check; update physically replaces journal lines | Corrections must use linked reversals, with period/date controls. Do not rewrite posted history. |
| BULK | P0 | `journals.service.ts:create` compares unique fetched account count with the number of line IDs | A normal bill with two lines using the same expense account can fail validation. Validate distinct account IDs and test repeated-account lines. |
| QUEUE | P1 | `document-intake.service.ts` uses `BoundedCache(200, 30min)` and detached asynchronous promises | Jobs/results disappear after restart and lack durable deduplication/backpressure. Use durable source storage, PostgreSQL metadata and bounded BullMQ workers. |
| CPUOCR | P1 | Fast mode sets qwen2.5:7b; OCR still calls Ollama for JSON; auto image mode can use VLM | Existing OCR mode is not an independent low-cost CPU path. Add deterministic extraction that works with every LLM endpoint unavailable. |
| RUNTIME | P1 | API Dockerfile installs Node/openssl, not assumed Python OCR/Word converters; Paddle startup checks import, later downloads a model and may fall back to Chinese/English | Package pinned Arabic resources and converters; verify full extraction readiness, not merely Python import. Remove runtime model downloads and silent language fallback. |
| FORMATS | P1 | File filter excludes DOC/DOCX; PDF native and OCR input cut at 4,000 characters; VLM reads PDF page zero | Support all declared formats and page-aware mixed PDFs. No silent loss of later-page totals or lines. Limits must be explicit rejection/review states. |
| VALIDATION | P1 | Missing extraction becomes `buildEmptyResult`, then `complete/100`; due date may become invoice date +30 days | Distinguish failed/review/ready; label defaults as derived. Empty output is not successful extraction. |
| PRIVACY | P1 | OCR strategy logs entire text and financial fields; Ollama service logs full JSON | Replace payload logs with identifiers, timings and redacted errors. Tracked environment filenames require a separate secret review; values were not disclosed or verified as live credentials here. |
| SMOKE | P1 | Root `ci:full` runs lint/type-check/unit only; CI does not invoke API E2E; existing E2E accepts 404 or skips assertions based on responses | Add seeded strict end-to-end tests that prove the demo and fail for broken routes. Do not infer integration readiness from a green unit suite. |
| DEPLOY | P1 | Production workflow uses workflow_run but checkout/tag derive from event/default context; manual/release route permits entry without a fresh equivalent CI gate | Deploy an immutable tested SHA/digest; verify migrations, health, backup/restore and rollback. Documentation-only changes should not redeploy production. |
| TELEGRAM | P1 | Repository tree has no invoice-ingestion Telegram module; current Telegram references concern AI infrastructure alerts | Implement tenant/channel binding, durable acceptance, replay protection and shared CPU intake. |
| REPORTS | P1 | Existing accounting reports and charts are present, but no connected live reconciliation was demonstrated | Prove bill/payment/reversal changes reconcile AP, trial balance and chart source totals on the same dataset. |

`pdf-to-images.util.ts` also always screenshots once, but no production caller was established; it is an additional inspection target, not evidence that the active VLM path uses that utility. Broader HR/CRM/inventory correctness, dependency exploitability, database policies, production configurations and UI rendering remain unverified beyond sampled paths.

## Recommended order

1. Identity, tenant scope, tax arithmetic, posting and bulk invariants.
2. Reproducible CPU runtime, persistent source/job identity and reliable extraction states.
3. Full format support, field validation, Telegram ingestion and accountant exception inbox.
4. Report reconciliation, strict API/browser acceptance, CPU benchmark and restore/rollback rehearsal.

The [ten-day roadmap](../roadmap.md) provides the schedule. The [acceptance contract](demo-acceptance.md) defines what ready means. [CPU extraction research](invoice-extraction.md) explains why replacing one LLM with another is insufficient. [Regional compliance research](regional-compliance.md) prevents imported documents being misrepresented as issued statutory invoices.

## Evidence reconciliation and stopping rule

Two independent research lanes examined extraction and country obligations; focused follow-up checked major accounting and intake findings. Primary sources support the CPU alternatives, Telegram contract and country distinctions. The UAE ASP deadline conflict was resolved against the binding amendment, rather than repeating the older guide. Research stopped when these decisions had primary support; actual model quality, customer tax applicability and deployed performance remain empirical gates, not facts a further web search can settle.
