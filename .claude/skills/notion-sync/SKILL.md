---
name: notion-sync
description: Keep the owner's Notion HQ true for Jarda · جردة (formerly Mizano) after anything ships and on request - milestone counts, open work, owner tasks, what shipped, decisions and draft posts - by writing to the HQ databases with the claude.ai Notion connector. Safe to run repeatedly (updates by Source id, never duplicates). Use after a ship, after closing a checklist issue, or when the owner asks for the Notion dashboards to be refreshed.
---

# notion-sync (Jarda · جردة (formerly Mizano), repo AbdelrhmanAh7/Mizano, branch master)

The owner reads Notion at a glance: **short, plain words, in English** (Arabic product names sit next to the English ones). No jargon in sentences: not "PR", "SHA", "migration", "RLS", "webhook", "token", "API", "JSON", "worktree". Say "change", "update to the database", "sign-in", "link". Jargon lives only in the GitHub links. Rewrite issue titles in plain words and keep the plan id (R1, P0-2, C02 ...).

Rebuilt on 1 Nov 2026: the old hub pages are in Notion's trash. Everything is now rows in nine databases (names follow the Conventions page, see "Names and live links"); the dashboards are filtered live views, so **you write rows, not page sections**. The tools are the claude.ai Notion connector (`notion-fetch`, `notion-query-data-sources`, `notion-create-pages`, `notion-update-page`). If it is not connected, stop and write `NEEDS-OWNER: connect the claude.ai Notion connector` in your status file (`.agent-tasks/sessions/status/<name>.md`).

## Ids (data source = the id for queries and for `parent: data_source_id`)
| What | Id |
|---|---|
| Company HQ (home dashboard, do not edit by hand) | 3ef27121047281b08732f713eda65503 |
| **Jarda · جردة (formerly Mizano) dashboard page** | 40b27121047281b4a17dc0c83df9c3ac |
| **Jarda · جردة (formerly Mizano) row in Products** (page id, used in every Product relation) | 40b27121-0472-8197-9e82-d7441fbb468b |
| Portfolio · Products | 4f1e4bcc-1652-4a0c-af24-a34905df873e |
| Delivery · Milestones | 87ae30cf-f5cb-4814-9a20-d7f49a2a90c1 |
| Delivery · Work | 619f0885-ddad-4a43-bce0-78154abd9f20 |
| Owner · Tasks | 7329ae2f-9746-4d86-b0ed-3d3938963a0f |
| Delivery · Shipped | c2014e22-4e10-40ae-82ee-b0846183e4a3 |
| Governance · Decisions | 437af562-024a-4dfe-96f7-35ff4cbb9fee |
| Marketing · Content calendar | 820f49f7-cf25-48d6-96f6-e15c53b49e07 |
| **Quality · Reports** (QA and release reports) | af3ea0b2-1631-4017-952b-d280f73dffdc |
| Sales · Leads (the owner's and the leads research's, **never write**) | 78381010-5dac-47db-8ee8-d4bd2ec133ba |
| HQ · Runbook · Conventions (naming rules) | 40b27121047281d1ac37c856e83496ff |
| Milestone rows (page ids) | First client ready `40b27121-0472-8152-9058-dd3855439294` (GitHub milestone 19); First month `40b27121-0472-81cc-b841-ebeeda9fa772` (milestone 20) |

Never touch: the charts, forms, buttons and automations the owner added on the HQ and the Work list (new properties are allowed, removing or renaming these is not), the other product's rows and page, the NileQuant hub and its data, the pages "NileQuant · Data" and "Personal · Archive", anything in Notion's trash. Never trash or delete anything and never empty the trash. Do not invent leads, prices or demand; unknown is written "unknown".

## Read first (facts come from GitHub and git, never from memory)
- Milestones: `gh api "repos/AbdelrhmanAh7/Mizano/milestones?state=all" --jq '.[]|[.number,.title,.open_issues,.closed_issues,.html_url]|@tsv'` (the two that matter: **First client ready**, **First month**).
- Issues: `gh issue list -R AbdelrhmanAh7/Mizano -s all -L 300 --json number,title,state,labels,milestone,closedAt,url`.
- Shipped: `gh pr list -R AbdelrhmanAh7/Mizano -s merged -L 40 --json number,title,mergedAt,url` (here a pull request is only the way changes get merged) and `gh release list -R AbdelrhmanAh7/Mizano -L 5`.
- Owner checklist: the open issue titled "Owner checklist" (labels `needs-owner`); its body holds `- [ ]` / `- [x]` lines.
- Waiting on the owner also includes every `NEEDS-ORCHESTRATOR` / `NEEDS-OWNER` line in the active files of `.agent-tasks/sessions/status/`.
- Decisions: `docs/DECISIONS.md` and the plan `docs/plans/first-client.md`, plus what the owner decided in chat (write the date and "owner decided").
- Draft posts: `docs/marketing/posts.en.md` and `posts.ar.md` once they are on master.

## What to write (upsert by the `Source id` text property; one row per source id)
To upsert: `notion-query-data-sources` with SQL `SELECT url FROM "collection://<id>" WHERE "Source id" = ?` (params: the id). Found: `notion-update-page` `update_properties` on that row, except in **Shipped, Decisions and Content calendar, where a found row is skipped** (append only). Not found: `notion-create-pages` with `parent: {type: data_source_id, data_source_id: <id>}`. Fetch a data source once if you need an exact property name. Formats: dates are `date:Date:start` plus `date:Date:is_datetime` = 0; relations are an array of page ids (always `["40b27121-0472-8197-9e82-d7441fbb468b"]` for Product); checkbox is `__YES__` / `__NO__`.

| Database | Rows and rules |
|---|---|
| **Milestones** | The product's two milestones: set `Done` (= closed issues) and `Total` (= closed + open) from `gh` ( `Bar` and `Progress %` are formulas, leave them), `Link`, `Number`, and `date:Checked:start` = today. Update the existing rows listed above. |
| **Work** | One row per **open** issue in the two milestones. `Source id` = `Mizano#<number>`. Title: plain words. `Priority` from the P0/P1/P2/P3 label (P3 when there is none). `Status`: `Waiting on you` when labelled `needs-owner` or `blocked`; `In progress` when someone is on it (an open branch or a status-file line); else `Ready`. `Milestone`: the matching milestone row. `Issue`, `Link`. To close rows: `SELECT url, "Source id" FROM "collection://619f0885-ddad-4a43-bce0-78154abd9f20" WHERE "Source id" LIKE 'Mizano#%' AND "Status" != 'Done'`; every row whose issue is no longer open gets `Status` = `Done` and, if `Done date` is empty, `date:Done date:start` = the issue's `closedAt` date (an automation in Notion also sets it when Status becomes Done; keep the row). Rows made by the Notion request forms have no `Source id`: never touch them. |
| **Owner tasks** | One row per checkbox line of the Owner checklist issue. `Source id` = `Mizano#<issue>-<n>` (n = position, starting at 1; new lines get the next number, never renumber). `Task` in plain words, `Why it matters` in one or two sentences, `Link` to the issue, `Done` = `__YES__` only when the line is ticked in GitHub (or the owner ticked it in Notion: never flip a ticked box back). |
| **Shipped** | **Append only.** One row per user-visible change (one row per merged request, however many commits it holds; skip requests with no user-visible effect, so the `Source id` stays stable) merged since the newest `Date` of this product's rows minus one day (14 days when there are none): `What shipped` in plain words, `Date`, `Link` to the change, `Source id` = `Mizano:pr<number>` (the merged request number, never a commit id) (always this one form, so a change that is read again on a later run is found and skipped). Do not rewrite older rows. A change that is merged but not deployed is still a row, worded "merged, not live yet". |
| **Decisions** | **Append only.** `Decision`, `Date`, `Why` in one or two plain sentences, `Source id` = `<date>-<first five words of the Decision, lower case, letters and digits, joined with ->` (computed the same way every run, so the same decision never gets two ids; before creating, also query by `Decision` text and `Date` and skip if a row matches). Never invent a different slug for a decision that is already in Notion. Cross-product decisions leave `Product` empty. |
| **Content calendar** | One row per post, new rows only: `Post` ("Day N · format · first words"), `Product`, `Language`, `Channel`, `Status` = Draft, proposed `Date`, full text in the page body, `Source id` = `jarda-en-dayN` / `jarda-ar-dayN`. **Never change `Status` or `Date` of an existing row** (the owner moves them to Approved / Posted). |
| **Quality · Reports** | **Append only; a found row is skipped** (the one exception: today's Release row, same `Source id`, may be updated while the day is open). One row per report: `Title` = `<Product> · Report · <QA or Release> — what`, `Product` (FlowLine or Jarda; select), `Type` (QA / Release / Weekly), `Date`, `Result` (Pass / Pass with notes / Partial / Fail / Info), `Link` (the place to look: live site, issue, commit list), `Summary` (2–4 plain sentences, real numbers only, nothing invented), `Open bugs` (QA rows only: count from `gh issue list -s open -l bug` at that moment), `Source id` = `report:<product>:<kind>:<name>:<date>`. Sources: (1) each finished QA status file of this product in `.agent-tasks/sessions/status/` (tests by independent testers, TestSprite runs, live checks; last line `DONE`) gives one QA row: `Pass` when nothing was found, `Pass with notes` when there are only observations, `Partial` when defects were filed (say how many are fixed), `Fail` when a main journey fails; (2) one Release row per day with merged changes: how many, 5–8 highlights in plain words, what is live and what is only merged, `Result` = `Info`. |
| **Products** | Update only this product's row: `Status` (Building / Ready for owner / Ready to sell / Paused), `Stage`, `First-client progress` (one line: "25 of 26 done (96%) ▰▰▰▰▰▰▰▰▰▰ — what is left"), `Live link` (the address testers open: FlowLine https://pixel-perfect-recreation-277.lovable.app; Jarda is a temporary tunnel address that runs on the owner's Mac and changes when it restarts, so take it from the line `Jarda online address:` in the prompt of a scheduled run (the runner reads `NEXTAUTH_URL` from `~/jarda-online/urls.env`), else from `~/jarda-online/urls.env` itself, else from the newest `jarda-deploy` status file; leave a URL field empty when unknown, never write the word "unknown" into it), `GitHub`, `Plan`, `Sales kit`, `Handbook` (GitHub file; the owner's "Handbook (Arabic page)" / "Handbook (English page)" links are set by hand, never touch them), `Marketing` (only links that exist on master), `date:Updated:start`. Status "Ready to sell" only when the lead's status file or `docs/RUNBOOK.md` says it is published and smoke-tested. |

Then, on the **Jarda · جردة (formerly Mizano) dashboard page**, fetch it and update only the sentences after `Where we are (date):` with `update_content` (the exact old sentences as `old_str`, never the link line that follows): the one thing that matters now, counts, the date. The rest of the page is live views and needs no edit. "Where we are" is a synced block: its original lives on this product page and the HQ home shows it as a reference, so edit the text **inside** the block on the product page only (never delete or recreate the block, never edit the HQ copy). **Never use `replace_content` or `allow_deleting_content` on any HQ page**: they can delete the live views.

Also keep the **green callout at the top of the Jarda dashboard page** true (it starts with `Live link:`): fetch the page, then `update_content` only the sentences after each bold label, never the labels: **Live link** (from the Products row; for Jarda add that it is temporary), **Status** (one plain sentence with the done/total count), **Open bugs** (count and, for each, a link `[#n](url)` with a three-word title, from `gh issue list -s open -l bug`), **Latest report** (mentions of the newest QA and Release rows: `<mention url="..."/>`). **Tester Handbook** is set by hand: never change it.

## Names and live links
- Every page is named `<Product> · <Type> · <Title> — <Arabic subtitle>` and every database `<Area> · <Name> — <Arabic>`; the rules and the allowed Types and emojis are on the Conventions page (id in the table above). Rows you create follow it (Reports titles above). If a page or database you touch breaks the rule, rename it (rename only, never move to trash).
- Product dashboards (`... · Dashboard · Overview`), handbooks, tester handbooks and the other documents sit under their product dashboard; HQ is the only entry point.

### Jarda online address (keep it current everywhere)
The address of the online test copy changes when the Mac or Docker restarts. The source of truth is `NEXTAUTH_URL` in `~/jarda-online/urls.env` (read only that key and `PUBLIC_API_URL`; never print or copy any other line of the file, it can hold secrets). On every Jarda run, if the address differs from what Notion shows, replace the old address with the new one in all of these places, with `update_content` (old text to new text) or `update_properties`, never `replace_content`:
1. Products row (Jarda): `Live link`, and the address inside `First-client progress` and the body line `Live address:`.
2. Jarda dashboard: the green callout `Live link:` and the "Where we are" paragraph (the synced block lives on that page).
3. Jarda tester handbook: `Test address` (English) and `عنوان النسخة التجريبية` (Arabic).
4. HQ dashboard: the `Live links:` line.
Then search Notion for the old host name once; anything still found (outside Reports rows, which keep the address they were tested on) gets the same replacement. Write the new address in the status line. If `urls.env` is missing or has no `NEXTAUTH_URL`, change nothing and say so.

## Scheduled run (no one is watching)
A launchd job on the owner's Mac (`com.thothlabs.notion-sync`, every 3 hours, logs in `~/Library/Logs/notion-sync`) runs this skill with `claude -p --model sonnet` once per product. In that run: do all of the above, **never ask a question**, never trash or delete, never use `replace_content`, finish within about 10 minutes, and write one line to the status file `notion-sync-jarda.md` (what changed, time, anything that could not be matched). If the Notion connector is missing write `NEEDS-OWNER: connect the claude.ai Notion connector` there and stop.

## Order of work and checks
1. Read GitHub and the status files, then write Milestones, Work, Owner tasks, Shipped, Decisions, Content calendar, Reports, Products, the "Where we are" paragraph and the green callout.
2. After the writes, `notion-query-data-sources` once: count Work rows with `Source id` like `Mizano#%` and `Status` not Done; it must equal the open issues in the two milestones. If not, fix the difference and say so in the status file.
3. Append one line to your status file: what you updated, the time, any row that could not be matched.

## Content rules
- Evidence = a link (issue, change, release, CI run) or a dated command result. No link, no tick.
- Shipped means merged into master. If it is not live for customers yet, say so in the row ("merged, not live yet") and keep the publish/deploy step in Owner tasks or the status file.
- No secrets, no customer data, no personal numbers. Product names: write Jarda / جردة (formerly Mizano) in every sentence; the repository, the code and the existing draft posts still say Mizano until the rename lands, so note that in the row instead of rewriting history.
- Keep the owner's view short enough to read in a minute.
