---
name: notion-sync
description: Update the Mizano hub in Notion after anything ships and on request - first-client checklist with evidence links, milestone progress from gh, what shipped, decisions, and what waits on the owner - using the claude.ai Notion connector. Safe to run repeatedly (updates in place, never duplicates). Use after a ship, after closing a checklist issue, or when the owner asks for the Notion page to be refreshed.
---

# notion-sync (Mizano, repo AbdelrhmanAh7/Mizano, branch master)

Keeps the owner's Notion page true. The owner reads it at a glance: **short, plain words, written in English** (the owner reads Arabic and English). No internal jargon: not "PR", "SHA", "migration", "RLS", "webhook", "token", "API", "JSON", "worktree". Say "change", "update to the database", "sign-in", "link". Keep jargon in the GitHub links, not in the sentences. Issue titles often contain jargon: rewrite each in plain words but keep its plan id (C03, W02, A1 …).

## Pages (claude.ai Notion connector: `notion-fetch`, `notion-update-page`, `notion-search`)
| Page | Id |
|---|---|
| Thoth Labs — Company HQ | 3ef27121047281b08732f713eda65503 |
| **Mizano hub (this product)** | 3ef27121047281dcac9fe93cd44d84c0 |
| FlowLine hub (not yours; do not edit) | 3ef27121047281b388cee7b9a0513981 |
| Thoth HQ — Owner view | 3f427121047281878c0febeed93bff7c |
| Archive (outdated pages go here, nothing is deleted) | 3f42712104728106a11fed84bd31aacd |

Touch only this product's hub, this product's card under `## Products` on the HQ page, and (if asked) the Owner view. **Never change NileQuant** (its HQ card is a link only). If the Notion connector is not available, stop and write `NEEDS-OWNER: connect the claude.ai Notion connector` in the status file (`.agent-tasks/sessions/status/<name>.md`).

## What to read first (facts come from GitHub and git, never from memory)
- Milestones: `gh api "repos/AbdelrhmanAh7/Mizano/milestones?state=all" --jq '.[]|[.number,.title,.open_issues,.closed_issues,.html_url]|@tsv'` (the two that matter: **First client ready**, **First month**).
- Plan items: `gh issue list -R AbdelrhmanAh7/Mizano -s all -L 200 --json number,title,state,labels,milestone,closedAt,url` (titles start with the plan id).
- Shipped: `gh pr list -R AbdelrhmanAh7/Mizano -s merged -L 30 --json number,title,mergedAt,url` and `gh release list -R AbdelrhmanAh7/Mizano -L 5`.
- Waiting on the owner: open issues labelled `needs-owner`, plus every `NEEDS-ORCHESTRATOR` / `NEEDS-OWNER` line in the active status files in the orchestrator folder `.agent-tasks/sessions/status/`.
- Open counts: `gh issue list -R AbdelrhmanAh7/Mizano -s open --json number -L 1000 --jq length` and `gh pr list -R AbdelrhmanAh7/Mizano -s open --json number -L 1000 --jq length`.

## The hub's sections (exact headings, in this order)
| Heading | What it holds | Rule |
|---|---|---|
| `## Vision` | The 31 Oct vision text | Never rewrite; only on the owner's request. |
| `## Where we are` | One short paragraph: the one thing that matters now, how many checklist lines are proven true, counts, the date | sync |
| `## First-client checklist` | One Notion to-do per plan checklist item | sync |
| `## Milestones` | Links to the GitHub milestones with done/total and a progress bar | sync |
| `## In progress` | What is being built now, one line each, with the issue link | sync |
| `## Shipped` | What people can now do, newest first, each with a link | sync, **append only** (see below) |
| `## Decisions` | Date · decision · why. From the plan or what the owner decided in chat | sync, **append only** |
| `## Waiting on the owner` | Only what the owner (or Claude as orchestrator) must do, one sentence + link each | sync |
| `## Older dashboards (not updated)` | Old synced tables kept for history | Never touch. |

Line formats (Notion Markdown):
- Checklist: `- [ ] [C01 · plain title](https://github.com/AbdelrhmanAh7/Mizano/issues/N) — state in 3–6 words · [evidence](link)`. Tick `[x]` only when the GitHub issue is **closed with evidence**. After the dash put the current one-line state; if a check waits on someone, say who.
- Milestones: `- [First client ready](https://github.com/AbdelrhmanAh7/Mizano/milestone/N) — 12 of 40 done (30%) ▰▰▰▱▱▱▱▱▱▱`. Counts are exactly closed / (open + closed) from `gh`.
- In progress / Shipped: `- 2026-10-31 · one plain sentence · [#N](url)`.
- **Shipped** means merged to master. If it is not deployed yet (the server or the Raspberry Pi), say "merged, not live yet" in the line, and list the deploy under *Waiting on the owner*.

## How to update safely (idempotent, in place)
1. `notion-fetch` the hub id. If an expected heading is missing, stop and report it in the status file; never create a second copy of a heading or a page.
2. Build each "sync" section's new body from the GitHub data above. If the result of an update shows a warning (for example the `old_str` matched nothing because the section changed), fetch the page again and retry once; if it still warns, say so in the status file. For **Shipped** and **Decisions** keep every line already on the page and add on top only new items: match Shipped by its link and Decisions by `date · decision` (decisions often have no link). A Shipped line with the same link may have its status words updated (for example "live" to "live, checked again"). Never drop older lines (the GitHub queries only look back a limited time).
3. For each section, copy the **exact** current text of the section **including its `## Heading` line** and call `notion-update-page` with `command: "update_content"` and `content_updates: [{old_str: <heading line + exact current body>, new_str: <heading line + new body>}]`. Including the heading keeps `old_str` non-empty and unique even when a section is empty or two sections read the same. Do not use `replace_content` on the whole page (it can drop the old dashboards) and do not use `insert_content` for these sections (it would duplicate on the second run).
4. Order lines by plan id (checklist) or newest first (Shipped), so a repeated run gives identical text: with no change in GitHub the page stays the same apart from the date lines (the date in *Where we are*, the HQ card's "Last updated", and `Last Refreshed`).
5. HQ card: fetch the HQ page and update, in place, only this product's callout under `## Products` (first line is the product name): one-line status, current milestone with done/total, live link, GitHub link, "Last updated YYYY-MM-DD". Use `update_content` on that callout only, with the product-name line in `old_str` and `new_str`.
6. Hub properties (the Project Portfolio row): with `update_properties` set the plain ones: `Open Issues`, `Open PRs`, `Next Outcome`, `Bottleneck` (one plain sentence), `MVP Plan` (checklist progress), `Roadmap` (one line per milestone with counts), and `date:Last Refreshed:start` to now. Formulas and rollups cannot be set; leave them. Call `notion-update-page` with `allow_async: false` (or wait with `notion-get-async-task`) so the update has landed, then fetch once more: if a value was overwritten back, an automation or custom agent is rewriting those properties; do not fight it, note it in the status file.
7. Append one line to the status file: what you updated, the time, and any heading that was missing.

## Content rules
- Evidence = a link (issue, change, commit, release, CI run) or a dated command result. No link, no tick.
- Don't invent dates, prices, demand or progress. Unknown is written as "unknown".
- No secrets, no customer data, no personal numbers. (This repo is public: the page ids above are not secrets, but never add tokens or keys here.)
- Mark owner actions clearly; keep that section short enough to read in a minute.
