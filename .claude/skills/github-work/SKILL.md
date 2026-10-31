---
name: github-work
description: Pick, build and ship Mizano work through GitHub - choose from the "First client ready" milestone, branch naming, labels, milestones, "Closes #" links, the Project card, the PR-as-merge-vehicle rule with the 4 checks, release notes and tags. Use when starting or finishing any tracked task.
---

# github-work (Mizano, repo AbdelrhmanAh7/Mizano, branch `master`)

`REPO=AbdelrhmanAh7/Mizano`, `BASE=master`. Plan: `docs/plans/first-client.md`. Rules: `AGENTS.md`, `docs/agents/review-lessons.md`. Never touch Hetzner or production, never commit secrets or `.env` files.
Orchestrator folder: `.agent-tasks/sessions/` in the orchestrator's workspace (`pixel-perfect-recreation-277` on the owner's Mac): `heavy.sh` queues heavy commands, `status/<name>.md` is your status file. If that folder is missing (another machine), run the command directly and say so in your report.
Status file for session work: `.agent-tasks/sessions/status/<name>.md`.

## 1. Pick the work
- Open work lives in the milestone **First client ready** (P0 work and every checklist item). **First month** is P1 and comes after.
  `gh issue list -R AbdelrhmanAh7/Mizano -m "First client ready" -s open --json number,title,labels -L 100`
- Take the highest priority first (label `P0` before `P1` before `P2`). Skip issues labelled `blocked` or `needs-owner` (they wait on something or someone else); say so in the status file instead.
- One issue per branch.  If the issue is bigger than about half a day, split it first into small issues (same milestone, each linking its plan item).
- Every issue links its plan item in `docs/plans/first-client.md` (C01–C12, A1–A3, W01–W15 (W12–W15 only once the plan's gate is met)). No plan item and no owner request: don't start it (no new product scope).

## 2. Branch, commit, labels
- Branch from the current `master`: `git fetch origin && git switch -c <name> origin/master`. Names: `feat/<n>-<topic>`, `fix/…`, `chore/…`, `docs/…`; a session's own branch is `agent/<name>`.
- Small commits with clear messages (commitlint: subject ≤ 72 characters and lower case, header ≤ 100; body lines up to 200 characters, keep them to about 100). Put `Closes #<n>` in the PR body (from the PR template) for a plain task or bug, so it closes on merge. For a **checklist** item (C01–C12) use `Refs #<n>` instead and close it by hand in section 6 with its evidence: a change landing is not the same as the check passing.
- Labels: one type (`bug`, `feature`, `chore`, `docs`), one priority (`P0`, `P1`, `P2`), plus `needs-owner` when only the owner can act and `blocked` when another issue must land first (name it in a comment; remove the label when it clears).
- Milestone: **First client ready** or **First month**. No due dates unless the plan states one.

## 3. Small PRs and stacks
- Prefer small single PRs (under about 300 changed lines). Stacked PRs only when one change truly needs layers: at most 3–4 layers, merge commits, never rebase or squash a pushed layer; the bottom PR targets `master` and nobody commits to `master` directly.
- GitHub's native stacks are a preview: the `gh stack` extension (v0.3.0) is installed on the owner's Mac and the stacks endpoint answers for this repo, but no real stack has been made yet. If a `gh stack` command fails, fall back to small single changes and say so in the status file.

## 4. Project card
- Each product gets one GitHub Project (v2) titled "Mizano — First client" with the status field **Todo / In progress / In review / Done** and the fields **Priority** and **Size**. Move the card as the work moves.
- Skip this section while `gh project list --owner AbdelrhmanAh7` fails or shows no such Project (creating it needs the owner to grant the `project` scope once: `gh auth refresh -h github.com -s project`). The milestone and the issue list are the board until then.
## 5. Ship (Mizano's own rule: a PR is only the merge vehicle)
1. Gates before shipping, all through `.agent-tasks/sessions/heavy.sh <command>` (shared slots). While iterating run only what your change touches; do not run the full suites locally: push and let the 4 GitHub checks run them. Locally: type-check (including the e2e config), lint with 0 warnings, knip (`pnpm lint:deadcode`), jscpd (`pnpm lint:duplication`) and the unit tests of the apps you touched; the build runs in CI.
2. Review the **exact tested head**: write the diff to a file and run a read-only review from a different provider: `agy --model gemini-3.8-flash-high --mode plan --print-timeout 30m -p "Read /tmp/<name>.diff and review it for bugs, money and ledger correctness, tenant isolation (organizationId on every query), security, and plain Arabic/English wording. End with 'VERDICT MERGE' or numbered findings."` (if the author is Gemini use `--model claude-opus-4-6-thinking`, no `--effort`); if agy fails use Codex (`codex exec --sandbox read-only …`) or a fresh read-only `claude -p --model opus --effort high --permission-mode plan "Review <diff file> … End with VERDICT MERGE or numbered findings."`. Auth, OAuth/MCP, money, ledger and permission changes need a second reviewer of another model family. Fix until `VERDICT MERGE`.
3. master's ruleset requires a pull request with 4 checks (Install Dependencies, Lint & Type Check, Unit Tests, Build) and resolved review threads. The owner wants no PR reviews, so the PR is only the vehicle: bring your branch up to date **before the first push** (rebase locally), push, then `gh pr create --base master --title "<type>: <what, lower case>" --body-file /tmp/<name>-pr.md` (a filled-in copy of `.github/pull_request_template.md`: `Closes #`, checks run, review verdict; `--fill` would skip the template), `gh pr checks --watch`, answer, then resolve every review thread (the ruleset needs them resolved), then `gh pr merge --merge`. The repo deletes merged branches by itself. After the first push never rebase: merge `origin/master` into the branch if it must be updated, and fix failing checks with new commits.
4. Stacks: only if `gh stack` works (section 3); every layer needs the 4 checks.

## 6. After it ships
- Check plain task and bug issues closed (the PR body had `Closes #<n>`). If a plan checklist line is now verifiably true, comment the evidence (SHA, command output, date) on its issue and close it. Never tick a line without evidence.
- Release notes and tags: only for a commit on `master` that was live-checked. Write notes in plain words (what a person can now do; no internal jargon), then `gh release create <tag> --target <that commit SHA> --notes-file <file>`. Tags: `first-client-YYYY-MM-DD` for a candidate that passed the plan's checks, otherwise `stable-YYYY-MM-DD`; add `-2`, `-3` if the tag exists. Merged is not the same as deployed (the server and the Raspberry Pi are deployed by the operator): say which one it is.
- Then run the `notion-sync` skill so the owner's page is true.

## Never
Force-push `master` or rewrite pushed history · put secrets, `.env` files or customer data in an issue, PR or release note · touch NileQuant · (workers) touch production servers or live databases: only the lead does that, through the runbook · invent dates, prices or demand.
