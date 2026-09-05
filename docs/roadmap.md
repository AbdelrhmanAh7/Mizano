# Mizano: ten-day CPU invoice demo roadmap

Owner: project maintainer. Baseline reviewed 5 September 2026. **Day 1: 5 September; Day 10 deadline: 14 September 2026, 23:59 Africa/Cairo.** All days below use Cairo dates. 2–3 wall-clock development hours/day; four concurrent bounded agent lanes. Target effort is roughly 80 focused agent-hours across the mandatory issues; concurrency does not remove review/integration time. Scope and acceptance stay fixed; capacity is reassessed daily.

## Goal and scope

Telegram/web document → durable original → CPU extraction → validated draft → one batch approval → ledger → partial payment → reconciled reports. EGP and accountant-led Egypt pilot scenario first. Arabic/English and clear exceptions are required. Full ERP breadth, new forecasts, production tax filing and paid/GPU AI are outside the demo. [Vision](strategy/vision.md), [review](strategy/repository-review.md), [acceptance](strategy/demo-acceptance.md).

## Daily execution

| Day/date | Codex lane | Claude lane | GLM lane | Antigravity lane | Integration gate |
| --- | --- | --- | --- | --- | --- |
| 1 · Sep 5 | AUTH/TENANT reproduction and repair | CPU runtime + four-provider preflight | Corpus/format inventory, extraction contract | Accountant inbox flow and current UI audit | Reproducible baseline; scope/ownership recorded |
| 2 · Sep 6 | MONEY/POSTING, BULK invariant fixes | Queue/storage interfaces + privacy | CPU baseline against shared schema | Exception states and source preview | P0 regression tests; no unsafe posting enabled |
| 3 · Sep 7 | Review financial changes, tenant tests | QUEUE durable worker/retry | CPUOCR native/Paddle/Tesseract comparison | Inbox implementation against contract | Offline CPU draft without LLM |
| 4 · Sep 8 | Review parser/validation integration | Restart/backpressure/privacy tests | FORMATS + VALIDATION | Inline correction + batch selection | PDF/Word/image to validated draft |
| 5 · Sep 9 | Ledger/idempotency integration tests | TELEGRAM channel binding/webhook | Poor-image fixtures and parser fixes | Connect Telegram/web inbox | Telegram document stored and queued once |
| 6 · Sep 10 | Batch approval/payment/reversal tests | Telegram retries/status handling | Holdout preparation; failure states | REVIEWUX one-action approval | Draft to posted bill/payment reconciles |
| 7 · Sep 11 | Report consistency and negative tests | Demo instance/backup preflight | Extraction tuning on dev set only | REPORTS charts, Arabic/mobile | Connected journey, no fake widgets |
| 8 · Sep 12 | SMOKE strict two-tenant API/browser gates | Immutable CPU deploy/restore | BENCHMARK frozen holdout | Keyboard/RTL/error-state verification | Candidate SHA, measured latency/quality |
| 9 · Sep 13 | Independent fix verification | Rollback/restart/20-doc batch rehearsal | Fix disclosed failure classes; retain holdout integrity | Accountant rehearsal and limited polish | Feature freeze; only blockers |
| 10 · Sep 14 | Final evidence/merge review | Verify deployed SHA and recovery | Publish benchmark limits | UAT recording and source drill-through | Accountant go/no-go; no P0 left |

One session: 15m reconcile issues/leases, 95m parallel work, 30m review/integrate, 10m checkpoint = 150m. Allow at most 30m integration buffer (180m hard stop). Work outside the daily window is queued. No unsupported provider CLI is represented as running. A session must persist progress before stopping. [Agent operations](agents/README.md).

## Milestones

| Milestone | Due | Exit gate |
| --- | --- | --- |
| M0 Safe foundation | Sep 6 | Identity, money/posting controls, CPU/tool preflight |
| M1 CPU document intake | Sep 8 | Durable complete-format extraction and reliable validation states |
| M2 Telegram to ledger | Sep 11 | One low-click workflow, posting/payment/report reconciliation |
| M3 Demo acceptance | Sep 14 | Strict E2E, holdout benchmark, CPU deploy/restore, accountant acceptance |
| M4 Egypt controlled pilot | After acceptance; date unset | ETA PreProd, actual customer onboarding; eReceipt only if needed |
| M5 Regional adapters | Date unset | Saudi sandbox and UAE ASP contracts independently validated |

The [machine-readable plan](planning/demo-plan.json) is the initial backlog. GitHub issues are the source of execution status after synchronization; do not overwrite humans' issue text or reopen completed work from the manifest. Dependencies are explicit in each issue. The sprint coordinator records emergent blockers, owns the shared schema and serializes integration.

## Cut and escalation policy

If Day 2 P0 controls are incomplete, all agents prioritize them and extraction/UI can continue only against isolated synthetic drafts. If Day 4 lacks a working CPU draft, restrict the supported layout set and remove optional model work. If Day 7 lacks the connected flow, drop extra charts and visual polish. If Day 9 still has financial or tenant failures, publish a blocked release with exact remaining issues; do not claim the ten-day target met or turn off failing tests. Unreadable images retain a clear repair route.

## After the demo

First validate value with a small accountant pilot: time to draft, correction time, repeat supplier rate, missing documents and period close friction. Then improve vendor templates, bank reconciliation, multi-client authorization and tax adapters using measured demand. Security, backup restoration and immutable accounting remain release gates. The prior broad roadmap is retained only as [historical context](archive/roadmap-before-2026-09.md).
