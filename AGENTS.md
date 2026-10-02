# Mizano project constitution

Applies repository-wide. Read this first, then the provider entrypoint, [current roadmap](docs/roadmap.md), [agent operations](docs/agents/README.md) and the assigned issue. The current user goal supersedes old autonomous-accounting/Colab-first product claims. Do not rewrite instructions to bypass authorization or tests.

## Goal

Deliver the accountant-led CPU invoice demo by **14 September 2026, 23:59 Africa/Cairo**: Telegram/web → original → extraction → validated draft → one batch approval → ledger → payment → reports. Ten daily development sessions, 2–3 wall-clock hours each. Four providers: Codex, Claude, GLM and Antigravity. Provider names describe intended tools, not proof that this environment has them connected.

## Non-negotiable domain rules

- Authenticate every resource read/write; scope jobs, files, streams, queries and all related IDs to the current authorized organization. Never trust caller-supplied organization or knowledge of an ID.
- Use Decimal arithmetic and decimal string transport for money. Separate tax percentage from tax amount. Reconcile line/header discounts, net/tax/gross and explicit currency.
- Reuse one financial command for manual, imported, bulk and automated operations. Posting/payment allocation/state updates must be transactional and idempotent, with source-event uniqueness.
- Posted history is immutable; correct through linked reversals. Enforce fiscal locks on single and bulk routes, and use the correct document/accounting date.
- Automatically receive, parse, match and prepare drafts. Explicit authorized batch approval posts the validated records. Uncertain/missing values go to exceptions. No autonomous payment execution or statutory submission in the demo.
- Preserve original documents, extraction evidence/version, correction and approval audit trail. Never log invoice text, credentials, bot tokens or auth headers.
- CPU-only critical path; no required GPU, Colab, paid API, 7B/8B model or runtime model download. Build pinned language assets into the worker. Real documents never enter an unapproved external model/free tier.
- Unknown results stay unknown. No fabricated accuracy, benchmark, review, test, deployment, agent invocation or compliance claim.

## Collaboration and code discipline

- Start from current GitHub `master` and record its SHA. Read the current issue state before taking work; do not treat this document's initial dates as proof of progress.
- Exactly one coordinator; it owns shared contracts/schema and the integration branch. Each implementer has one issue, branch and worktree. Use a lease/claim with owner, scope, expiry and heartbeat; no concurrent editing of shared paths.
- Four logical lanes may run together, but local CPU/RAM and build concurrency determine execution limits. At most one expensive build/test at a time on a small host; no four competing OCR workers.
- Every code change goes through a PR linked to an issue. A fresh reviewer independent of the author reviews the exact tested head; prefer a different provider when available and disclose the actual reviewer/provider. Author self-review is not independent approval. Resolve substantive review findings before merge. Never bypass protected-branch rules or identity/permission controls.
- Before writing code, a worker brief or a review, read [review lessons](docs/agents/review-lessons.md): every rule there is a past review finding. Add new root causes to it in the PR that fixes them. Request both Codex (`@codex review`) and Copilot reviews on every PR.
- Read only needed paths and diff. Return evidence, not full transcripts. One bounded retry on quota/transient failure, then checkpoint/route to an available provider. Do not spawn endless workers or guess CLI flags.
- Keep Next.js/NestJS/PostgreSQL/Redis and current shared packages. No framework rewrite or new HR/CRM/manufacturing scope during this sprint. Follow existing TypeScript/module/i18n conventions.
- Explicitly handle loading/empty/error/reconnect states; preserve Arabic/English and RTL. Use real APIs and reconciled report data, not demo-only fake success responses.

## Validation and release

Use current package scripts; `pnpm ci:full` currently covers lint, type-check and unit tests, **not E2E**. For code changes, run affected tests plus the full API/web suite and build before final acceptance. Run seeded API E2E and browser journeys from the demo contract. Never remove assertions or accept 404 for a required feature to green the suite. Infrastructure failure is blocked evidence, not passed evidence.

Pure documentation changes need links/format/content verification and repository-required CI; planning scripts additionally need their offline tests. Do not weaken gates for a pending PR. Bind review and deployment to exact SHAs/digests. A documentation/planning-only change should not redeploy the application. Do not reset existing databases or rotate real secrets without the appropriate operator workflow.

Finish each session with issue/PR links, actual provider/version, tested SHA, commands/results, remaining risks, lease release and next task in a durable checkpoint. The full [acceptance contract](docs/strategy/demo-acceptance.md) decides go/no-go.
