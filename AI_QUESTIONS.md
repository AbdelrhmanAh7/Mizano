# Open questions for the owner (#135)

The #135 acceptance criteria are GitHub state changes: closing issues, merging PRs and editing labels. The implementer rules forbid merging PRs, and closing other agents' issues and PRs before this PR is reviewed would skip review. So this PR ships the verified evidence ([docs/planning/STALE-ISSUES.md](docs/planning/STALE-ISSUES.md)) plus the salvaged e2e cases, and stops short of the GitHub actions.

1. **Merge #82, then ready and merge #84.** #82 is approved and mergeable (`CLEAN`). #84 is still a draft with an `UNSTABLE` merge state. Only the owner can merge them.
2. **Run the close/label commands** in `docs/planning/STALE-ISSUES.md` after this PR merges, so the "moved to master" comments on #75/#76 are true. Should the coordinator run them, or do you want to?
3. **deploy.yml (CI change, owner only).** `deploy.yml:14-18` still runs on every completed `CI` run of master. Today the workflow is `disabled_manually`, which stops the SSH-timeout failures but leaves the trigger in place. Suggested durable fix: change the trigger to `release` + `workflow_dispatch` only (drop `workflow_run`) until the deploy host is reachable or the Pi deploy replaces it. Not changed here because workflow edits stop at the owner.
4. **#103 review lessons.** #103 has 8 review-lessons lines from its reviews (masked hosts, `Refs` not `Closes` for diagnosis PRs, etc.). Should they move to master when #103 closes? This PR leaves them out to stay in scope.
5. **#39 vs #110 and #39 vs #42.** Which branch should keep `GET /health/ready` (DB+Redis on `ai/39`, DB+disk on `ai/110`), and which intake worker entrypoint (`src/worker.ts` on `ai/39`, `src/intake-worker.ts` on `ai/42`)? The audit only asks that one of each pair be dropped before merge.
