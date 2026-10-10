# Backlog restructure — 2026-10-10

Owner ask: smaller, linked tasks with no duplicate work, a vision with clear goals, and a manual test per goal. Vision and goals: [vision.md](vision.md).

## Counts

| | before | after |
|---|---|---|
| Open issues | 54 | 65 |
| Open issues in a goal milestone | 0 | 60 |
| Duplicates closed (as duplicate, cross-linked) | — | 1 |
| Stale/obsolete closed (not planned, with reason) | — | 1 |
| Merged into another issue (scope copied by comment) | — | 0 |
| Oversized issues split → new sub-issues | — | 1 → 4 |
| New small tasks (next-phase integration, metrics) | — | 6 |
| Goal demo checklist issues | 0 | 6 |
| Sub-issue links added | — | 26 |
| Labels renamed to the shared spelling | — | 6 |

## Goals

- [MZ G1 · Safe, green master (P0 blockers)](https://github.com/AbdelrhmanAh7/Mizano/milestone/13) — due 2026-10-16 — demo #175
- [MZ G2 · Pi stable: 15/15 pilot features green](https://github.com/AbdelrhmanAh7/Mizano/milestone/14) — due 2026-10-23 — demo #176
- [MZ G3 · Bill scan to posted entry, feature-complete](https://github.com/AbdelrhmanAh7/Mizano/milestone/15) — due 2026-10-30 — demo #177
- [MZ G4 · Pilot launch: 3 accountants post a scanned bill](https://github.com/AbdelrhmanAh7/Mizano/milestone/16) — due 2026-11-02 — demo #178
- [MZ G5 · FlowLine integration API (keys + webhooks)](https://github.com/AbdelrhmanAh7/Mizano/milestone/17) — due 2026-11-16 — demo #179
- [MZ G6 · Post-pilot: Telegram intake, VAT and hardening](https://github.com/AbdelrhmanAh7/Mizano/milestone/18) — due 2026-12-15 — demo #180

## What changed

**Duplicates closed:** #102 dup of #113

**Closed as not planned:** #159 not planned

**New issues:** #165 (mz90a), #166 (mz90b), #167 (mz90c), #168 (mz90d), #169 (mzint), #170 (mzint1), #171 (mzint2), #172 (mzint3), #173 (mzint4), #174 (mzint5), #175 (demo-G1), #176 (demo-G2), #177 (demo-G3), #178 (demo-G4), #179 (demo-G5), #180 (demo-G6)

**Sub-issue links:** #165 under #90; #166 under #90; #167 under #90; #168 under #90; #170 under #169; #171 under #169; #172 under #169; #173 under #169; #174 under #169; #38 under #45; #39 under #45; #40 under #45; #41 under #45; #42 under #45; #43 under #45; #44 under #45; #158 under #45; #104 under #97; #105 under #97; #119 under #114; #120 under #114; #141 under #133; #142 under #133; #153 under #23; #134 under #23; #94 under #11

**Labels:** priority:P0 -> priority:p0; priority:P1 -> priority:p1; priority:P2 -> priority:p2; type:strategy -> type:epic; ci -> type:ci; type:quality -> type:chore. Shared set across FlowLine_Web, Mizano and NileQuant: `type:{bug,feature,chore,docs,test,security,ci,epic,demo}`, `priority:p0..p3`, `area:*`, `pilot`, plus the hub's `ai-ready`, `ai-skip`, `ai-claude`, `ai-stuck`, `ai-hold`, `ai-fix`, `codex-handoff`, `needs-owner`, `model:*`, `effort:*`, `difficulty:*`. Renames keep every issue attached; no label the hub reads was deleted (the hub matches `priority:\s*p0` case-insensitively).

**Board:** https://github.com/users/AbdelrhmanAh7/projects/20 — fields Goal, Status, Priority, Due; every open issue and PR added.

## Rules kept

- No issue, branch or repo deleted; duplicates closed with a link. No open PR code touched.
- All GitHub writes went through the hub gh layer (`bin/gh-shim`, job `backlog-restructure`), paced at ~4 writes/min above the budget floors.
