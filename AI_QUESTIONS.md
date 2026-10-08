# AI_QUESTIONS.md — Owner Decision Needed for Issue #102 (Deploy to GCP red on master)

## Status of this PR

**Diagnosis only. This PR does not fix the failing check and does not close #102.** The failing job is `Deploy to GCP` in `.github/workflows/deploy.yml`; it fails on an SSH connection timeout to the deployment host. Both possible fixes (restoring the host, or changing when the workflow deploys) are owner actions: repository policy for implementers is "never modify `.github/workflows`, CI config or secrets — write CI suggestions in `AI_QUESTIONS.md`; CI changes always stop at the owner". Master stays red until the owner applies one of the options below. Merging this PR will itself trigger another `Deploy to Production` run, which is expected to fail the same way while the host is unreachable. If the `Deploy to Production` workflow is already disabled (via `gh workflow disable deploy.yml` or the Actions settings), a merge will not trigger a rollout.

## Diagnosis

Default-branch commit `615060e` (merge of #98) has a green `CI` run (`37540682498`). The red check was the follow-on `Deploy to Production` run `37540990404`, job `Deploy to GCP`, step `Clean up server disk and prepare directory`:

```text
dial tcp ***:22: i/o timeout
```

1. **Established cause — SSH to the deployment host times out.** The host in `DEPLOY_HOST` did not accept a TCP connection on port 22 within the 30 s timeout. Every `Deploy to Production` run on master since run `36854180434` (2026-10-01) has failed with the same error. The log proves an SSH connection timeout. Possible causes (not confirmed) are a stopped or deleted VM, a firewall rule blocking GitHub-hosted runners, or a changed IP address. Confirming which one needs GCP console access, which this implementer does not have.
2. **Contributing observation — documentation-only merges still trigger a rollout.** `deploy.yml` runs on every successful `CI` run on `master`. Its scope gate compares every file changed since the fixed baseline `f8bf699` with `docs/planning/rollout-exemption.json`; because runtime and workflow changes have landed since that baseline, the gate evaluates `should_deploy=true`, so the planning-only #98 also attempted a GCP rollout. `AGENTS.md` states "a documentation/planning-only change should not redeploy the application". This is an observation for the owner, not a defect this PR can fix: the gate lives in the workflow.

Whether GCP is still the intended production or staging target is **not established**. `docs/DEVELOPMENT.md` still describes `deploy.yml` as the production pipeline, and `deploy/pi/README.md` says the Raspberry Pi deployment is unverified. The owner must confirm GCP's role before any option that stops automatic GCP rollouts is chosen.

---

## Options (owner decision)

### Option A: Restore SSH reachability of the GCP host

If GCP remains the production/staging target: start or recreate the VM, verify firewall rules for TCP 22 from GitHub runners, and update `DEPLOY_HOST` if the host changed.

_Note on rerunning workflows_: Direct the owner to rerun the latest failed deployment associated with the intended current master head or trigger `workflow_dispatch` at that exact revision. Do not re-run older historical runs (such as `37540990404`), because GitHub Actions preserves the original event revision (`615060e`) for checkout and container image tagging (`tag=${GITHUB_SHA::8}`), which would deploy the older revision and not clear checks on a newer master commit.

### Option B: Stop automatic rollouts on every master CI run

Only if the owner confirms GCP should no longer receive automatic rollouts (for example, while the Raspberry Pi target from #45 replaces it). Remove the `workflow_run` trigger so deployment runs only on `release` or `workflow_dispatch`:

```diff
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -12,10 +12,6 @@
 name: Deploy to Production

 on:
-  workflow_run:
-    workflows: ["CI"]
-    types: [completed]
-    branches: [master]
   release:
     types: [published]
   workflow_dispatch:
```

_(Note: Diff verified against `.github/workflows/deploy.yml`. Downstream jobs handle this safely because `check-ci` guards with `github.event_name == 'workflow_dispatch' || github.event_name == 'release' || github.event.workflow_run.conclusion == 'success'` and checks out `${{ github.event.workflow_run.head_sha || github.sha }}`, so neither step reads `workflow_run._` unconditionally).\*

Any commit modifying `deploy.yml` directly changes its SHA-256, which `docs/planning/rollout-exemption.json` pins in `deployment_workflow_sha256` and `scripts/test_demo_rollout_scope.py` asserts. Such a change must therefore:

1. update `deployment_workflow_sha256` to `shasum -a 256 .github/workflows/deploy.yml`;
2. pass `python3 scripts/test_demo_rollout_scope.py` (offline gate test).

Alternatively, the owner can disable the workflow via GitHub CLI or Actions settings (`gh workflow disable deploy.yml`).

### Option C: Make documentation-only merges skip the rollout

Keep automatic rollouts for runtime changes but update the scope gate in `deploy.yml` to evaluate changes across the full triggering push.

_Crucial requirement_: The gate must use the push's actual before-SHA (e.g. from the triggering push event payload) or another range that conservatively covers every commit in the push, rather than comparing `head_sha` against only its first parent (`head_sha^..head_sha`). A single-parent comparison inspects only the tip commit and would incorrectly skip deployment when an earlier commit in the push touches runtime code and the tip commit is docs-only—a regression explicitly guarded against by `test_runtime_earlier_commit_and_documentation_final_commit_deploys` in `scripts/test_demo_rollout_scope.py:91-94`.

This option would require updating `deployment_workflow_sha256` in `docs/planning/rollout-exemption.json`, adding unit tests in `scripts/test_demo_rollout_scope.py` for multi-commit push handling, and extending `planning_paths` (which currently does not include `docs/planning/MERGE-QUEUE.md`). Moreover, it does not fix host unreachability: the next runtime merge would still fail until Option A is resolved.

---

## Suggested default

**Option A** if GCP is still the production target; otherwise **Option B**. Option C is independent and can follow either. Until the owner decides, #102 stays open.
