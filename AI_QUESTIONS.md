# AI_QUESTIONS.md — Owner Decision Needed for Issue #102 (Deploy to GCP red on master)

## Status of this PR

**Diagnosis only. This PR does not fix the failing check and does not close #102.** The failing job is `Deploy to GCP` in `.github/workflows/deploy.yml`; it fails on an SSH connection timeout to the deployment host. Both possible fixes (restoring the host, or changing when the workflow deploys) are owner actions: repository policy for implementers is "never modify `.github/workflows`, CI config or secrets — write CI suggestions in `AI_QUESTIONS.md`; CI changes always stop at the owner". Master stays red until the owner applies one of the options below. Merging this PR will itself trigger another `Deploy to Production` run, which is expected to fail the same way while the host is unreachable.

## Diagnosis

Default-branch commit `615060e` (merge of #98) has a green `CI` run (`37540682498`). The red check is the follow-on `Deploy to Production` run `37540990404`, job `Deploy to GCP`, step `Clean up server disk and prepare directory`:

```text
dial tcp ***:22: i/o timeout
```

1. **Established cause — SSH to the deployment host times out.** The host in `DEPLOY_HOST` did not accept a TCP connection on port 22 within the 30 s timeout. Every `Deploy to Production` run on master since run `36854180434` (2026-10-01) has failed with the same error. The log does not say why; possible causes (not confirmed) are a stopped or deleted VM, a firewall rule, a changed IP, or a network-level block. Confirming which one needs GCP console access, which this implementer does not have.
2. **Contributing observation — documentation-only merges still trigger a rollout.** `deploy.yml` runs on every successful `CI` run on `master`. Its scope gate compares every file changed since the fixed baseline `f8bf699` with `docs/planning/rollout-exemption.json`; because runtime and workflow changes have landed since that baseline, the gate always returns `should_deploy=true`, so the planning-only #98 also attempted a GCP rollout. `AGENTS.md` says "a documentation/planning-only change should not redeploy the application". This is an observation for the owner, not a defect this PR can fix: the gate lives in the workflow.

Whether GCP is still the intended production or staging target is **not established**. `docs/DEVELOPMENT.md` still describes `deploy.yml` as the production pipeline, and `deploy/pi/README.md` says the Raspberry Pi deployment is unverified. The owner must confirm GCP's role before any option that stops automatic GCP rollouts is chosen.

---

## Options (owner decision)

### Option A: Restore SSH reachability of the GCP host

If GCP remains the production/staging target: start or recreate the VM, check the firewall rule for TCP 22 from GitHub-hosted runners, and update `DEPLOY_HOST` if the IP changed. Then re-run `37540990404` (or dispatch `Deploy to Production`) to turn master green. No repository change is needed.

### Option B: Stop automatic rollouts on every master CI run

Only if the owner confirms GCP should no longer receive automatic rollouts (for example, while the Pi target from #45 replaces it). Remove the `workflow_run` trigger so deployment runs only on `release` or `workflow_dispatch`:

```diff
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -14,10 +14,6 @@ name: Deploy to Production

 on:
-  workflow_run:
-    workflows: ["CI"]
-    types: [completed]
-    branches: [master]
   release:
     types: [published]
   workflow_dispatch:
```

Any edit to `deploy.yml` changes its SHA-256, which `docs/planning/rollout-exemption.json` pins in `deployment_workflow_sha256` and `scripts/test_demo_rollout_scope.py` asserts. The same change must therefore:

1. update `deployment_workflow_sha256` to the output of `shasum -a 256 .github/workflows/deploy.yml`;
2. pass `python3 scripts/test_demo_rollout_scope.py` (offline gate test).

Trade-off: master pushes stop updating production automatically, so a working replacement deployment path should exist first.

### Option C: Make documentation-only merges skip the rollout

Keep automatic rollouts for runtime changes but change the scope gate in `deploy.yml` to look at the changes in the triggering push (for example `github.event.workflow_run.head_sha` against its first parent) instead of everything since `f8bf699`. This needs the same hash update and offline test as Option B plus new test cases, and #98's files (`EVIDENCE.md`, `docs/planning/MERGE-QUEUE.md`) are not in `planning_paths` today, so the path list would also need a reviewed extension for such a merge to skip. It does not fix the outage: the next runtime merge would still fail until Option A is done.

---

## Suggested default

**Option A** if GCP is still the production target; otherwise **Option B**. Option C is independent and can follow either. Until the owner decides, #102 stays open.
