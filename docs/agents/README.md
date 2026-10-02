# Four-provider operating guide

Read [AGENTS.md](../../AGENTS.md) and [the ten-day plan](../roadmap.md). This is an executable handover specification for the coordinator; it does not claim the local providers or daily timer are already running.

## Roles and ownership

| Provider    | Default lane                               | Owned scope                                                 | Independent reviewer |
| ----------- | ------------------------------------------ | ----------------------------------------------------------- | -------------------- |
| Claude      | Coordinator, queue/Telegram/runtime        | Integration decisions, job lifecycle, deployment tooling    | Codex                |
| Codex       | Accounting/security and final verification | Identity, tenant checks, Decimal/posting/bulk invariants    | Claude               |
| GLM         | CPU extraction implementation              | Parser/OCR adapter, field rules, fixtures and benchmark     | Codex                |
| Antigravity | Accountant UX and charts                   | Inbox, preview/corrections, RTL/mobile, report presentation | Claude or Codex      |

Either Claude or Codex can receive the entry prompt and coordinate. If Codex coordinates, it delegates its implementation work to a separate worker and Claude independently reviews those changes. The coordinator may implement bounded integration work, but cannot approve its own changes as independent review. Roles are defaults; use demonstrated availability and task fit. The P0 backlog alone is estimated at 21 agent-hours, so it cannot all sit with one Codex worker during the first two days. Split non-overlapping implementation across available providers (for example frontend session isolation, backend tenancy and the shared tax calculator), while the coordinator serializes shared-schema and posting integration. Treat early milestone dates as at-risk forecasts until Day 1 capacity and reproduction results are known; retain the Day 10 release target and report any miss honestly. Do not invent model IDs or pretend current ChatGPT subagents are the four external products.

Shared contract owner: coordinator. Freeze document/job/result schemas before parallel integration. Shared schema/migrations, package locks, workflow files and root instructions have one active owner at a time. Workers coordinate schema requests through the coordinator instead of independently editing Prisma. Use branches `demo/<issue>-<topic>` from the current baseline and isolated `git worktree` directories.

## Day-one capability preflight

1. Record host CPU architecture, RAM, free disk, repository SHA and dirty state. Do not overwrite user changes.
2. Discover each installed executable and inspect its actual `--help`/version and authenticated status. GLM may be reached through an existing OpenCode or other verified provider interface. Antigravity may require a supported agent/UI interface rather than a headless CLI. **Do not guess flags or count a GUI as an unattended worker.**
3. Run a read-only smoke task with each provider. Record executable/argv, model actually selected, output and exit code in `docs/agents/runs/YYYY-MM-DD.md`, redacting secrets.
4. If a provider lacks a supported unattended route, mark that lane blocked. Use available workers on independent tasks while documenting the missing fourth lane. Do not claim all four started or promise unattended execution until smoke evidence exists.
5. Implement or reuse a verified local launcher with argv arrays (no shell-evaluated prompt text), isolated process groups/worktrees, timeout, cancellation, quota handling, bounded logs and persistent queue/leases. Complete issue AGENTS before calling one-prompt orchestration operational.

## Daily budget and scheduling

Proposed local schedule: **19:00 Africa/Cairo**, 150-minute session, 180-minute hard ceiling, daily through 14 September 2026. This is a default for the operator-host runner, not an activated ChatGPT reminder. On first activation, confirm the actual host timezone and timer output, and record next run; if today's window passed, start a bounded catch-up session without silently extending the deadline. The continuously running invoice service is separate from this development schedule.

- 00–15m: fetch GitHub truth, triage new blockers, identify ready dependencies, assign one issue per lane and acquire lease.
- 15–110m: bounded parallel implementation; compact each worker context around its issue and changed files.
- 110–140m: independent review, exact-head tests and serialized merges.
- 140–150m: persist checkpoint, update issues and release leases. Optional integration buffer to 180m; no new work after minute 140.

Use a local systemd timer or the host's supported scheduler for the verified runner. Store its service definition and setup instructions in the follow-up implementation PR. Include a stop control, one-active-session lock, missed-run policy and reboot recovery. User's requested daily operation is authorized, but no remote host/runtime was connected in this planning review; never report it as installed from a sample configuration alone.

## Task lifecycle

Ready issue → lease → scoped plan → branch/worktree → implement → affected tests → PR → independent review on exact head → full required gates → merge → demo deployment of exact tested SHA → health/acceptance evidence → close. Recheck dependencies before picking the next issue. `Needs review`, `Blocked` and `Done` mean real evidence states, not elapsed time.

A lease record contains issue key/number, provider, run ID, paths, baseline SHA, worktree, acquired/expiry time and heartbeat. Renew while active. Recover stale leases only after verifying no live worker still owns the process/worktree. Never steal work based only on a missing UI update.

For provider quota/failure: checkpoint diff and next step; permit one bounded retry if transient; reroute to a different authorized available provider with a fresh scoped prompt. Do not bypass permissions, disable checks or repeatedly relaunch a stuck model. Always distinguish provider rate limits from application defects.

## Minimal prompts and evidence

Every worker brief must include or link [review lessons](review-lessons.md); reviewers check changes against it.

Give each worker the issue URL, baseline SHA, acceptance criteria, owned paths, dependencies, 60–90 minute task budget and reviewer. Ask for a patch/PR plus evidence. Do not send all docs/full repository to every worker. The coordinator keeps a compact dependency map, consumes summaries and reads consequential diffs directly.

Daily checkpoint template:

```markdown
# Run YYYY-MM-DD (Africa/Cairo)

Start/end and elapsed minutes:
Baseline / integrated / deployed SHA:
Provider versions and smoke proof:
Completed issues / PRs / exact-head review:
Commands and outcomes (including failures):
Extraction corpus version / accuracy denominators / CPU p95 and RAM:
Remaining blockers and owner:
Leases released / active worktrees:
Next ready issue per lane:
Next scheduled run (verified timer output):
```

The single entry prompt is [START-HERE.md](START-HERE.md). Provider entrypoints are [CLAUDE.md](../../CLAUDE.md), [CODEX.md](../../CODEX.md), [GLM.md](../../GLM.md), [ANTIGRAVITY.md](../../ANTIGRAVITY.md). Configure each tool's supported instruction discovery; filenames other than its native convention are references, not a guarantee of automatic loading.
