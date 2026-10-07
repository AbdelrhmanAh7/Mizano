# AI_QUESTIONS.md — Owner Decision for Issue #102 (Deploy to GCP red on master)

## Status of this PR

**Diagnosis and decision record. This PR documents the diagnosis and records the owner's decision.** The failing check on master was `Deploy to GCP` in `.github/workflows/deploy.yml`, which failed on a TCP connection timeout to the GCP deployment host. Because repository policy strictly reserves modifications to `.github/workflows`, CI config, or repository secrets to the owner, options were documented here for owner action.

On 2026-10-07, the repository owner recorded the decision: the GCP host is retired and unreachable, production moves to the Raspberry Pi 5, and the `Deploy to Production` workflow has been disabled via GitHub.

---

## Owner Decision (2026-10-07)

> **Owner decision**: The GCP VM (`34.165.73.152`, `me-west1`) is not on Google's Always Free tier and is unreachable, so production moves to the Raspberry Pi 5. The 'Deploy to Production' (GCP) workflow is disabled (reversible: `gh workflow enable deploy.yml`). Next: deploy from the Mac mini hub to the Pi (milestone P4 | Pi go-live) once hub SSH access to the Pi is in place.

Current state:
- Workflow state: `Deploy to Production` (`deploy.yml`, ID `231427938`) is `disabled_manually`.
- Milestone: Milestone P4 (Pi go-live) will handle Pi deployments via the Mac mini hub.

---

## Diagnosis

Default-branch commit `615060e` (merge of #98) has a green `CI` run (`37540682498`). The red check was the follow-on `Deploy to Production` run `37540990404`, job `Deploy to GCP`, step `Clean up server disk and prepare directory`:

```text
dial tcp ***:22: i/o timeout
```

1. **Established cause — SSH to the deployment host times out.** The host in `DEPLOY_HOST` did not accept a TCP connection on port 22 within the 30 s timeout. Every `Deploy to Production` run on master since run `36854180434` (2026-10-01) failed with the same error. The log proved a network timeout; the owner confirmed on 2026-10-07 that the VM is unreachable and not on Google's Always Free tier.
2. **Contributing observation — documentation-only merges still triggered a rollout.** `deploy.yml` previously ran on every successful `CI` run on `master`. Its scope gate compared every file changed since baseline `f8bf699` with `docs/planning/rollout-exemption.json`; because runtime and workflow changes landed since that baseline, the gate evaluated `should_deploy=true`, so the planning-only #98 also attempted a GCP rollout. `AGENTS.md` states "a documentation/planning-only change should not redeploy the application".

---

## Analyzed Options & Technical Notes

### Option A: Restore SSH reachability of the GCP host

If GCP had remained the production/staging target: start or recreate the VM, verify firewall rules for TCP 22 from GitHub runners, and update `DEPLOY_HOST` if the IP changed.

*Note on rerunning workflows*: Direct the owner to rerun the latest failed deployment associated with the intended current master head or trigger `workflow_dispatch` at that exact revision. Do not re-run older historical runs (such as `37540990404`), because GitHub Actions preserves the original event revision (`615060e`) for checkout and container image tagging (`tag=${GITHUB_SHA::8}`), which would deploy the older revision and not clear checks on a newer master commit.

### Option B: Stop automatic rollouts on every master CI run (Adopted via workflow disable)

The owner chose this path by disabling the workflow via `gh workflow disable deploy.yml`.

If modifying `deploy.yml` in code rather than disabling via CLI, the `workflow_run` trigger would be removed:

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

*(Note: Diff verified against `.github/workflows/deploy.yml`. Downstream jobs handle this safely because `check-ci` guards with `github.event_name == 'workflow_dispatch' || github.event_name == 'release' || github.event.workflow_run.conclusion == 'success'` and checks out `${{ github.event.workflow_run.head_sha || github.sha }}`, so neither step reads `workflow_run.*` unconditionally).*

Any commit modifying `deploy.yml` directly changes its SHA-256, which `docs/planning/rollout-exemption.json` pins in `deployment_workflow_sha256` and `scripts/test_demo_rollout_scope.py` asserts. Such a change must therefore:
1. update `deployment_workflow_sha256` to `shasum -a 256 .github/workflows/deploy.yml`;
2. pass `python3 scripts/test_demo_rollout_scope.py` (offline gate test).

### Option C: Make documentation-only merges skip the rollout

Keep automatic rollouts for runtime changes but update the scope gate in `deploy.yml` to evaluate changes across the full triggering push.

*Crucial requirement*: The gate must use the push's actual before-SHA (e.g. from the triggering push event payload) or another range that conservatively covers every commit in the push, rather than comparing `head_sha` against only its first parent (`head_sha^..head_sha`). A single-parent comparison inspects only the tip commit and would incorrectly skip deployment when an earlier commit in the push touches runtime code and the tip commit is docs-only—a regression explicitly guarded against by `test_runtime_earlier_commit_and_documentation_final_commit_deploys` in `scripts/test_demo_rollout_scope.py:91-94`.

This option would require updating `deployment_workflow_sha256` in `docs/planning/rollout-exemption.json`, adding unit tests in `scripts/test_demo_rollout_scope.py` for multi-commit push handling, and extending `planning_paths` (which currently does not include `docs/planning/MERGE-QUEUE.md`). Moreover, it does not fix host unreachability.

---

## Conclusion

The owner resolved the GCP deployment check on 2026-10-07 by disabling the `Deploy to Production` workflow (`gh workflow disable deploy.yml`) and shifting production deployment to Raspberry Pi 5 under milestone P4.
