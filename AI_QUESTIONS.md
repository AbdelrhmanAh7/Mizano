# AI_QUESTIONS.md — #113 / MZ #102: master "CI red" after PR #98

Written by the AI implementer for #113. Everything here needs an owner decision; nothing in
`.github/workflows`, secrets or `.env*` was changed. Evidence with run IDs and log lines is in
`EVIDENCE.md` under "Post-merge CI red after #98".

## Summary for the owner

- The red check on master is the `Deploy to GCP` job, not CI. Lint, type-check, unit tests and
  build are green on the merge commit `615060e`.
- The job dies in its first SSH step with `dial tcp ***:22: i/o timeout`. The VM behind
  `DEPLOY_HOST` has not answered on port 22 from GitHub-hosted runners since 2026-10-01
  (run `36854180434`). The last green deploy was 2026-09-05 (run `33939629464`).
- PR #98 added two markdown files and nothing else. It did not cause this. The MZ #102 alert is
  a false attribution.
- There is no code fix. The decisions below are the fix.

## Q1. What should happen to the GCP deploy? (default: retire it)

The roadmap targets a Raspberry Pi 5 live deployment, and both `CI` and `Deploy to Production`
are currently `disabled_manually`. Options:

1. **Retire the GCP deploy (proposed default).** Leave `deploy.yml` disabled, or remove the
   `workflow_run` trigger so it is `workflow_dispatch` only. Then a red deploy can never be
   mistaken for red CI again, and the Pi path in `deploy/` stays the only live target.
2. **Restore the VM.** Check whether the VM at the IP in the `deploy.yml` header comment is
   running and whether its firewall still allows port 22 from GitHub runner ranges:

   ```bash
   gcloud compute instances list --filter="networkInterfaces[0].accessConfigs[0].natIP=34.165.73.152"
   gcloud compute firewall-rules list --filter="allowed[].ports:22"
   nc -z -w 5 34.165.73.152 22 && echo reachable || echo unreachable
   ```

   If the VM is gone, option 1 applies.

3. **Keep the workflow but let it fail quietly.** Not recommended: a permanently red check hides
   real breakage.

Whichever you pick, `CI` also needs re-enabling, or no PR gets a GitHub run at all.

## Q2. Post-merge canary note (suggested changes, owner applies)

Two small changes stop this class of false alarm and catch real post-merge breaks earlier.

**A. Follow-up Manager: compare against the parent commit, not against "all green".**
Before opening a "CI red after #N" issue, fetch the same check on the parent commit. If the
check was already red there, file it as "pre-existing infra failure", not as a regression. The
two calls it needs:

```bash
gh api repos/AbdelrhmanAh7/Mizano/commits/615060ed6294e16375a1f1ea9385cb7e812cd24f/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'
gh api repos/AbdelrhmanAh7/Mizano/commits/b83d72b/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'
```

If the `Deploy to GCP` line is `failure` in both, it is not caused by the merge. The issue body
should also quote the `--log-failed` tail instead of "no log lines captured":

```bash
gh run view 37540990404 --log-failed | grep -E 'dial tcp|##\[error\]' | tail -5
```

**B. Deploy job: a reachability preflight before any SSH step.** Suggested step for the owner
to add at the top of the `deploy` job in `.github/workflows/deploy.yml` (not applied here):

```yaml
- name: Preflight — deploy host reachable on port 22
  run: |
    if ! nc -z -w 10 "${{ secrets.DEPLOY_HOST }}" 22; then
      echo "::error title=Deploy host unreachable::DEPLOY_HOST does not answer on TCP 22 from this runner. This is infrastructure, not a code regression. See EVIDENCE.md (#113)."
      exit 1
    fi
```

The job still fails, but the error title tells the Follow-up Manager and the next engineer that
it is infrastructure, so they stop looking for a breaking change in the merged PR.

**C. Pre-merge parity.** PR checks and master checks should be the same set. Deploy jobs that
SSH to a server can only run post-merge, so they should never be counted as "CI". Suggested rule
for the hub: only `CI`-workflow checks decide "CI red"; `workflow_run`-chained deploy workflows
are reported as "deploy failed" with their own issue template.

## Q3. Unrelated: the hub's `automerge.sh` has a bash syntax error

Run `37629176009` (`AI implementers`, job `automerge`) fails on the Mac mini with:

```text
/Users/abdelrahmanahmed/agents/nql-agents/bin/automerge.sh: line 103: syntax error near unexpected token `done'
```

This script lives outside the repository. It blocks automerge for every Mizano PR, including
this one. Reproduce on the Mac mini with:

```bash
bash -n /Users/abdelrahmanahmed/agents/nql-agents/bin/automerge.sh
```

## Q4. Why there is no regression test in this PR

The plan asked for a test that is red on master and green after the fix. The failing behaviour
is TCP reachability of an external VM from a GitHub-hosted runner. No repository test can fail
for that reason, and the owner rule forbids workflow edits, so the preflight step in Q2-B is the
closest equivalent and is left to the owner.

## Q5. Closing MZ #102 (owner action, after this PR merges)

MZ #102 must stay open until this PR has merged. Suggested closing comment:

> **Root cause.** The red check after #98 was `Deploy to GCP`, not CI. Its first SSH step times
> out (`dial tcp ***:22: i/o timeout`). The VM behind `DEPLOY_HOST` has been unreachable on
> port 22 from GitHub runners since 2026-10-01 (run 36854180434); the last green deploy was
> 2026-09-05 (run 33939629464). PR #98 changed two markdown files and did not cause it. Full
> evidence with run IDs: `EVIDENCE.md` in #113.
>
> **Canary note.** Before filing "CI red after #N", the Follow-up Manager now compares the
> failing check against the parent commit; a check that was already red is filed as
> pre-existing infra, not as a regression. Deploy jobs chained by `workflow_run` are reported as
> "deploy failed", never as "CI red". The deploy job gets a port-22 reachability preflight so
> the error names the cause. Decisions on the GCP VM itself are in `AI_QUESTIONS.md` of #113.

Both `CI` and `Deploy to Production` are disabled, so there will be no post-merge run to link
until they are re-enabled. If you re-enable `CI` before merging, the run link for the merge
commit belongs in the closing comment.
