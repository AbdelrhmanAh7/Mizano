# GitHub delivery planning

The initial [manifest](demo-plan.json) defines **24 issues, 19 labels and 6 milestones**. It includes acceptance criteria, dependencies, proposed provider lanes and estimated effort. Milestone dates are UTC representations of end-of-day Africa/Cairo: the final demo target is 14 September 2026. Four milestones govern the demo; two undated milestones cover later Egypt/regional pilots.

[Open the sprint tracking issue](https://github.com/AbdelrhmanAh7/Mizano/issues/7) or [the verified issue index](issue-index.md). Initial sync succeeded; the personal Project remains not configured.

## Synchronize and verify

The one-off sync script (`scripts/sync-demo-planning.py`) and its **Demo planning metadata** workflow were retired in the 2026-10 slim-down: the initial sync succeeded, the workflow had been disabled with 0 runs in the last 14 days, and native GitHub issues/milestones are authoritative. Both remain in git history (tag `archive/pre-slimdown-2026-10-10`); this folder keeps the manifest as a record.

## Project board

Desired private user Project: **Mizano | CPU Invoice Demo | 10 Days**, linked to this repository. The optional `MIZANO_PROJECT_TOKEN` must have user Projects write access and repository visibility; configure it through the user's normal secure credential process, never paste it in a chat or commit it. A repository `GITHUB_TOKEN` alone does not supply personal Projects access. Without that credential, repository planning still completes and the result explicitly says `project: not_configured`; a Project must not be reported created.

When authorized Project access is available, the reconciler creates/reuses the private Project, links this repository and adds all planned issues. Suggested views (configure using supported Project UI/API; not created by the current reconciler):

| View | Filter/group | Purpose |
| --- | --- | --- |
| Demo board | `demo:required`, group by Status | Ready work, In progress, In review, Blocked, Done |
| Ten-day roadmap | Milestone and due date | Gates M0–M3 and dependencies |
| P0 blockers | `priority:P0` and open | Financial/tenant release risk |
| After demo | `demo:later`, group by country | ETA/ZATCA/UAE research and pilots |

Use existing default Status fields where possible; only claim custom views/options or automatic field transitions when actually configured and verified. The coordinator updates status from real issue/PR evidence. Repo labels and milestones remain fully usable if the optional Project is pending.

## Working rules

Select tasks whose dependencies are closed/verified; record real human/agent owner at execution time rather than assigning every task to the maintainer. Lease one issue and path set per worker. Use P0 for demo-blocking finance/security defects, P1 for required journey/reliability, P2 for after-demo scope. Link PRs to issues; attach exact-head tests/review/deploy evidence before closing. No artificial issue closure to meet a metric.

