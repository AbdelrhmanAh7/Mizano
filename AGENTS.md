# Mizano project constitution

Applies repository-wide. Read this first, then the provider entrypoint, [current roadmap](docs/roadmap.md), [agent operations](docs/agents/README.md) and the assigned issue. The current user goal supersedes old autonomous-accounting/Colab-first product claims. Do not rewrite instructions to bypass authorization or tests.

## Goal

Run a tiny live deployment on a **Raspberry Pi 5 (8GB, arm64)** with the full accountant flow: core ledger (AP/AR, reports, Arabic/English) + invoice intake (web upload, CPU-only extraction, validated drafts, batch approval) + Telegram ingestion. Tracking epic: issue #45 (closed; work is now tracked in the "First client ready" milestone). Milestones: "First client ready" and "First month" (the older P1–P4 milestones are closed). Project board: "Mizano — First client" once the owner grants the GitHub `project` scope.

## Non-negotiable domain rules

- Authenticate every resource read/write; scope jobs, files, streams, queries and all related IDs to the current authorized organization. Never trust caller-supplied organization or knowledge of an ID.
- Use Decimal arithmetic and decimal string transport for money. Separate tax percentage from tax amount. Reconcile line/header discounts, net/tax/gross and explicit currency.
- Reuse one financial command for manual, imported, bulk and automated operations. Posting/payment allocation/state updates must be transactional and idempotent, with source-event uniqueness.
- Posted history is immutable; correct through linked reversals. Enforce fiscal locks on single and bulk routes, and use the correct document/accounting date.
- Automatically receive, parse, match and prepare drafts. Explicit authorized batch approval posts the validated records. Uncertain/missing values go to exceptions. No autonomous payment execution or statutory submission in the demo.
- Preserve original documents, extraction evidence/version, correction and approval audit trail. Never log invoice text, credentials, bot tokens or auth headers.
- CPU-only critical path: ledger, AP/AR, reports and invoice intake (the rules reader) work with no AI account, GPU, Colab tunnel, 7B/8B model or runtime model download. Build pinned language assets into the worker.
- Owner decision (31 Oct 2026): AI is optional and runs only through the organization's own account (a Claude, OpenAI, Gemini or OpenRouter key, a connected OpenRouter account, or an Ollama server the operator configured), off by default and per feature, after an admin's consent naming the provider, under a monthly limit reserved before each call. It stays advisory. Real documents never reach a provider without that consent; Mizano never ships a shared or free-tier AI key. See [AI through the customer's own account](docs/plans/ai-own-accounts.md).
- Unknown results stay unknown. No fabricated accuracy, benchmark, review, test, deployment, agent invocation or compliance claim.

## Collaboration and code discipline

- Start from current GitHub `master` and record its SHA. Read the current issue state before taking work; do not treat this document's initial dates as proof of progress.
- Exactly one coordinator; it owns shared contracts/schema and the integration branch. Each implementer has one issue, branch and worktree. Use a lease/claim with owner, scope, expiry and heartbeat; no concurrent editing of shared paths.
- Four logical lanes may run together, but local CPU/RAM and build concurrency determine execution limits. At most one expensive build/test at a time on a small host; no four competing OCR workers.
- Owner decision (31 Oct 2026): no pull request *reviews* are wanted. `master`'s ruleset still requires a pull request with its 4 checks (Install Dependencies, Lint & Type Check, Unit Tests, Build), so a PR is only the merge vehicle (see [github-work](.claude/skills/github-work/SKILL.md)). Work happens on a branch, passes the local gates (lint, type-check, unit tests of what you touched, knip, jscpd), is reviewed by an independent CLI reviewer from a different provider than the author (read-only, on the exact tested head; record the reviewer and the SHA in the PR), and is merged once the blockers are fixed. Author self-review is not independent approval. Never bypass identity or permission controls.
- Before writing code, a worker brief or a review, read [review lessons](docs/agents/review-lessons.md): every rule there is a past review finding. Add new root causes to it in the change that fixes them. Bot reviews on GitHub (CodeRabbit, `/code-review`) are optional extras, never a merge gate.
- Read only needed paths and diff. Return evidence, not full transcripts. One bounded retry on quota/transient failure, then checkpoint/route to an available provider. Do not spawn endless workers or guess CLI flags.
- Keep Next.js/NestJS/PostgreSQL/Redis and current shared packages. No framework rewrite or new HR/CRM/manufacturing scope during this sprint. Follow existing TypeScript/module/i18n conventions.
- Explicitly handle loading/empty/error/reconnect states; preserve Arabic/English and RTL. Use real APIs and reconciled report data, not demo-only fake success responses.

## Tracked work and the owner's Notion page

Pick, branch, label and ship work by [github-work](.claude/skills/github-work/SKILL.md): milestone "First client ready", `Closes #`, the Project card, and the PR-as-merge-vehicle rule with the 4 checks. After anything ships, refresh the owner's Notion page by [notion-sync](.claude/skills/notion-sync/SKILL.md). Claude loads both as skills; Codex and Antigravity read the same files and follow them step by step.

## Validation and release

Use current package scripts; `pnpm ci:full` currently covers lint, type-check and unit tests, **not E2E**. For code changes, run affected tests plus the full API/web suite and build before final acceptance. Run seeded API E2E and browser journeys from the demo contract. Never remove assertions or accept 404 for a required feature to green the suite. Infrastructure failure is blocked evidence, not passed evidence.

Pure documentation changes need links/format/content verification and repository-required CI; planning scripts additionally need their offline tests. Do not weaken gates for a pending PR. Bind review and deployment to exact SHAs/digests. A documentation/planning-only change should not redeploy the application. Do not reset existing databases or rotate real secrets without the appropriate operator workflow.

Finish each session with issue/PR links, actual provider/version, tested SHA, commands/results, remaining risks, lease release and next task in a durable checkpoint. The full [acceptance contract](docs/strategy/demo-acceptance.md) decides go/no-go.
