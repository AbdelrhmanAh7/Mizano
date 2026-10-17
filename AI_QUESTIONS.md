# #113: owner action needed (ci-change label)

## State of `ai/113` (HEAD after f97c89b)

The fix for MZ #102 is a trigger-only edit to `.github/workflows/deploy.yml`
(CTO decision on #113, 2026-10-10). I committed it in 9aae00f; the harness
reverted it in f97c89b because the issue has no `ci-change` label.

The other files on the branch assume that edit is in place, so right now:

- `apps/api/src/common/utils/deploy-workflow.spec.ts` fails (2/2) on HEAD.
  It failed on c626c25 (before the fix) and passed on 9aae00f (with the fix).
- `docs/planning/rollout-exemption.json` holds the sha256 of the edited
  `deploy.yml`, so `scripts/test_demo_rollout_scope.py` will not match
  master's `deploy.yml`.
- `docs/DEVELOPMENT.md:149` and `EVIDENCE.md` describe deploy as manual-only.

My attempt to revert those three files to `origin/master` was blocked in
this session, so the branch is left as is. Do not merge it in this state.

## Root cause (for MZ #102)

`deploy.yml` ran on `workflow_run` after every green CI on `master` (and on
`release`). Its SSH step to the GCP host times out (host unreachable since
2026-10-01), so every merge showed a red "Deploy to Production" run. It
predates PR #98; #98 was the first merge after the host went down.

## Owner decision needed (pick one)

1. **Label #113 `ci-change`** so the harness keeps the workflow edit. Then
   re-apply 9aae00f's `deploy.yml` hunk (drop `workflow_run` and `release`,
   keep `workflow_dispatch`, header comment pointing to DEPLOY #25). The spec,
   the exemption hash and the docs then all pass and agree.
2. **No workflow change.** Revert `EVIDENCE.md`, `docs/DEVELOPMENT.md`,
   `docs/planning/rollout-exemption.json` to `origin/master` and delete
   `apps/api/src/common/utils/deploy-workflow.spec.ts`, then disable the
   "Deploy to Production" workflow in the repo settings (founder-only).
