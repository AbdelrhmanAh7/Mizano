# Mizano: Raspberry Pi live roadmap

Owner: project maintainer. Goal changed 2 October 2026: the target is a tiny live deployment on a Raspberry Pi 5 (8GB, arm64) with the full accountant flow. Tracking epic: issue #45. Project board: `Mizano — Pi Live`. GitHub issues are the source of execution status; this document asserts no completed progress.

> Superseded: the ten-day CPU invoice demo plan (deadline 14 September 2026, four-provider operation) is no longer the goal.

## Goal and scope

Core ledger (AP/AR, reports, Arabic/English) + invoice intake (web upload, CPU-only extraction, validated drafts, one batch approval) + Telegram ingestion, running live on the Pi. EGP and accountant-led Egypt pilot scenario first; Arabic/English and clear exceptions are required. Full ERP breadth, production tax filing and paid/GPU AI stay out of scope. [Vision](strategy/vision.md), [review](strategy/repository-review.md), [acceptance](strategy/demo-acceptance.md).

## Milestones

| Milestone             | Issues                                      |
| --------------------- | ------------------------------------------- |
| P1 Pi platform        | #38, #39, #40, #41, #43                     |
| P2 Ledger correctness | #8, #9, #10, #11, #12, #19, #22             |
| P3 Intake & Telegram  | #15, #16, #17, #18, #20, #21, #24, #42, #52 |
| P4 Pi go-live         | #23, #44, #45                               |

Each issue carries its own dependencies and acceptance criteria; do not overwrite humans' issue text or reopen completed work. The sprint coordinator records emergent blockers, owns the shared schema and serializes integration. On a slipped milestone, publish the blocked state with the exact remaining issues; do not claim the target met or weaken tests. [Agent operations](agents/README.md).

Issue #44 execution checklist: [Pi live acceptance runbook](../deploy/pi/RUNBOOK.md).
It covers platform preparation, both intake routes, the English/Arabic accountant journey,
restore/rollback drills and evidence-bound GO/NO-GO; its existence does not mark P4 complete.

## After go-live

Validate value with a small accountant pilot: time to draft, correction time, repeat supplier rate, missing documents and period close friction. Then improve vendor templates, bank reconciliation, multi-client authorization and tax adapters using measured demand. Security, backup restoration and immutable accounting remain release gates. The prior broad roadmap is retained only as [historical context](archive/roadmap-before-2026-09.md).
