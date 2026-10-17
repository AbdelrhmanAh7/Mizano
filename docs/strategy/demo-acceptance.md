# Demo acceptance contract

> **Pi note (2 October 2026):** this acceptance contract now applies to the Raspberry Pi live deployment; tracking in #44.

Target: a tiny live deployment on a Raspberry Pi 5 (8GB, arm64), tracked by epic #45. The ten-day demo target is superseded by the Pi plan (#45). This is a proposed test/release contract, not an assertion of passing results. All checks apply to the exact candidate SHA on the actual CPU demo environment.

## Required journey

1. Log in as accountant A; show an independent tenant B cannot see A's records. Verify concurrent refresh isolation.
2. Send a readable Arabic supplier invoice as a document into the configured private Telegram channel. No web upload or scan-mode click. Show original, queued/running status and automatically prepared draft.
3. Upload native PDF, scanned/mixed multi-page PDF, DOCX, legacy DOC and a phone image via web. Show page-two totals and full line items. Include an unreadable photo; it must enter an exception with a resubmit/correct path.
4. Show supplier matching and duplicate detection. Replay the Telegram update, double-click a web request and restart a worker. Each source must create at most one active draft/posting.
5. Review sources and fields in one inbox. Correct only flagged values. Approve a selected valid batch in one action. Missing currency, totals mismatch and invalid tenant account references cannot pass.
6. Demonstrate exact arithmetic: 2 × 100, 14% tax → net 200, tax 28, gross 228 through scan and manual entry. Include discount, decimal and mixed-tax cases; totals reconcile per declared rounding.
7. Record a partial payment, inspect remaining AP, trial balance and journal. Reverse a posted transaction and show linked corrections without rewriting history. Try a locked-period single/bulk action and concurrent approval; both controls must hold.
8. Use charts to drill through to the same posted records. Show drafts separately, correct date/as-of filters and EGP denomination.
9. Restart the CPU instance/worker and recover a queued job; restore backup into an isolated database and verify original-to-ledger links. Display the deployed SHA/digest.

## Pass criteria and evidence

| Gate                    | Required evidence                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security/identity       | Seeded anonymous/two-tenant/API/SSE tests, cross-reference rejection and concurrent refresh tests; no invoice/auth payload in captured logs                                                                                                                                                                                                                                     |
| Accounting              | Exact Decimal fixture totals, balanced journals, transactional failure injection, idempotency/concurrency, bulk/single parity and per-record outcomes; seeded [accountant journey E2E](../../apps/api/test/accountant-journey.e2e-spec.ts) covers period locks, posted-journal immutability, repeated-account lines and payment-void allocation/AP/trial-balance reconciliation |
| Format completeness     | Every declared format and mixed-page test; no silent text/page truncation; explicit encrypted/corrupt/oversized behavior                                                                                                                                                                                                                                                        |
| Automation and recovery | Zero clicks from configured Telegram channel to draft; <=1 batch approval action for ready invoices; bounded retries/dead-letter, 20-document batch and restart/replay evidence                                                                                                                                                                                                 |
| OCR quality             | Labelled dev/holdout corpus; >=95% critical-header exact-match target on readable holdout, numerator/denominator and slices; all uncertain monetary fields repairable                                                                                                                                                                                                           |
| CPU performance         | Actual hardware/model versions; warm/cold p50/p95, RAM and batch throughput. Provisional warm p95 <=30s for supported <=3-page invoices, no out-of-memory/crash                                                                                                                                                                                                                 |
| Delivery                | Required CI/build and strict seeded API/browser journeys; exact-head independent review; tested immutable deploy, health and restore/rollback evidence                                                                                                                                                                                                                          |
| UX                      | Arabic/English RTL, 375px and desktop, keyboard/source preview, loading/empty/error/reconnect states                                                                                                                                                                                                                                                                            |

On a target miss, publish measured result and impact; do not redefine the metric after seeing data. Average OCR accuracy never authorizes a wrong posting. Time/size limits reject or mark review-required rather than dropping data. Local hardware and an accountant-labelled corpus are Day 1 prerequisites; absent evidence keeps the applicable gate open.

## Useful charts for the first demo

| Chart/view                    | Definition and source                                                                                                                  | Accountant action                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| AP aging                      | Remaining supplier balances by not-due, 1–30, 31–60, 61–90, >90 days at explicit as-of date; exclude void/deleted records consistently | Select a bucket → outstanding bill list and original documents |
| Posted income versus expenses | Period buckets from posted ledger account classifications; drafts excluded; explicit sign rules and currency                           | Drill to general-ledger lines and sources; reconcile sums      |
| Cash movements                | Actual posted cash/bank inflows and outflows by period; not an AI forecast or claim of live bank balance                               | Inspect payments, transfers and supporting records             |
| Intake operations             | Counts by queued/running/ready/review-required/failed; duplicate rate, correction time and processing p95 from durable job events      | Open exceptions/retry, identify poor source documents          |

Use 2–3 accountant charts plus the intake status strip first; additional category/vendor breakdown is stretch. Prefer simple bars/lines and accessible data tables, clear zero/empty states, date/tenant filters and source drill-through. Never sum EGP/SAR/AED without a documented dated FX conversion. Figures on screen must reconcile with an API/export query, not a mocked presentation fixture.

## Final release record

Record candidate/deployed SHA, issue/PR links, test commands/results, reviewer identity/provider, fixture/corpus version, CPU specifications, benchmark denominators, screenshots/recording with synthetic data, restore evidence and accountant go/no-go. Mark every unverified gate explicitly. Live ETA/ZATCA/UAE filing, production payment execution and full peripheral ERP-module acceptance are outside this demo.
