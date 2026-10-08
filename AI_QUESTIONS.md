# AI_QUESTIONS.md — #113 / MZ #102: master "CI red" after PR #98

Nothing in `.github/workflows`, secrets or `.env*` was changed. Evidence is in `EVIDENCE.md`.

## Summary

- The red check is `Deploy to GCP`, not CI. Lint, type-check, unit tests and build are green on `615060e`.
- Its first SSH step fails with `dial tcp ***:22: i/o timeout` on every run since 2026-10-01.
- PR #98 changed two markdown files. It did not cause this; the MZ #102 alert is a false attribution.

## Q1. What should happen to the GCP deploy? (default: retire it)

1. **Retire it (proposed).** Keep `deploy.yml` disabled or make it `workflow_dispatch` only; the Pi
   path in `deploy/` stays the live target.
2. **Restore the VM.** Check it and its firewall:

   ```bash
   gcloud compute instances list --filter="networkInterfaces[0].accessConfigs[0].natIP=34.165.73.152"
   nc -z -w 5 34.165.73.152 22 && echo reachable || echo unreachable
   ```

`CI` is also disabled; without re-enabling it no PR gets a GitHub run.

## Q2. Canary note (owner applies)

**A. Compare with the parent commit before filing "CI red after #N".** If the same check is red
on the parent, file it as pre-existing infrastructure:

```bash
gh api repos/AbdelrhmanAh7/Mizano/commits/615060ed6294e16375a1f1ea9385cb7e812cd24f/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'
gh api repos/AbdelrhmanAh7/Mizano/commits/b83d72b/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'
gh run view 37540990404 --log-failed | grep -E 'dial tcp|##\[error\]' | tail -5
```

**B. Port-22 preflight at the top of the deploy job** (not applied here):

```yaml
- name: Preflight — deploy host reachable on port 22
  run: |
    nc -z -w 10 "${{ secrets.DEPLOY_HOST }}" 22 || { echo "::error title=Deploy host unreachable::infrastructure, not a code regression (see EVIDENCE.md, #113)"; exit 1; }
```

**C. Only `CI`-workflow checks decide "CI red".** `workflow_run`-chained deploys are reported as "deploy failed".

## Q3. Unrelated: hub `automerge.sh` syntax error

Run 37629176009 fails with `automerge.sh: line 103: syntax error near unexpected token 'done'`.
It lives outside this repo. Reproduce with:

```bash
bash -n /Users/abdelrahmanahmed/agents/nql-agents/bin/automerge.sh
```

## Q4. Closing MZ #102 (owner, only after this PR merges)

> **Root cause.** The red check was `Deploy to GCP`: its SSH step times out (`dial tcp ***:22:
i/o timeout`), unreachable since 2026-10-01 (run 36854180434). PR #98 changed two markdown
> files. Evidence: `EVIDENCE.md` in #113.
>
> **Canary note.** Compare the failing check with the parent commit before filing; deploy jobs
> are reported as "deploy failed", not "CI red"; the deploy job gets a port-22 preflight.
