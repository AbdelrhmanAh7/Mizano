# AI_QUESTIONS.md — Post-merge CI red after #98 (#113, MZ #102)

## Root cause (for MZ #102)

Master went red after PR #98 merged, but #98 did not cause it. PR #98 changed two
markdown files only (`EVIDENCE.md`, `docs/planning/MERGE-QUEUE.md`; 230 insertions;
no source, lockfile, compose, env or workflow file). The red check was `Deploy to GCP`
in `.github/workflows/deploy.yml`: every deploy run since 2026-10-01 fails at the
first SSH step with `dial tcp ***:22: i/o timeout` because the GCP server is
unreachable. The same failure is on the parent commit `b83d72b` (run 37403603742)
and on all 12 runs from 36854180434 (2026-10-01, first failure) to 37540990404; the
last success is 33939629464 (2026-09-05). MZ #102 compared the merge commit against
"all green" instead of against its parent, so a pre-existing infra failure was
misread as a #98 regression.

## Fix in this PR

`.github/workflows/deploy.yml` is deleted (CTO decision, 2026-10-09: GCP server
unreachable, remove the deploy job). With the workflow gone, the only master checks
are the `CI` workflow jobs (Unit Tests / Build / Lint & Type Check / Install
Dependencies), which pass on the merge commit (run 37540682498). The deploy can be
re-added when the GCP server is back; DEPLOY issue #25 owns the re-add.

## Post-merge CI canary (suggestion — CI changes stop at the owner)

This class of failure — an external-infrastructure workflow turning the pipeline
red after merge — was noticed only because someone looked. A canary that checks
the latest master commit on a schedule and reports any red check:

```bash
# Post-merge CI canary — run every 30 min (cron / scheduled workflow)
SHA=$(git ls-remote https://github.com/AbdelrhmanAh7/Mizano.git refs/heads/master | cut -f1)
gh api "repos/AbdelrhmanAh7/Mizano/commits/$SHA/check-runs" \
  --jq '.check_runs[] | select(.conclusion == "failure") | "\(.name): \(.conclusion)"'
```

Empty output = green. Any line = a red check on master; open an issue with the
output and the run link `https://github.com/AbdelrahmanAh7/Mizano/actions`.

Pre-merge half of the same canary: in the `CI` workflow, after the test jobs,
fail the build when any file under `.github/workflows/` references a secret or
external host, so external-infrastructure dependencies are reviewed before merge
instead of silently going red after it.

## Open questions for the owner

1. Re-add `.github/workflows/deploy.yml` when the GCP server is back? (DEPLOY issue #25 owns the re-add; this PR only removes the red workflow.)
2. Should the canary be a scheduled GitHub Actions workflow in this repo or an external monitor? CI config changes stop at the owner.
