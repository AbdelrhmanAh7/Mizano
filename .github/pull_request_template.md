## Problem and resulting behavior

## Documentation is part of the change

Every agent and human must update **every affected `.md` file in the same PR**: READMEs,
`docs/*`, `deploy/pi/README.md`, `AGENTS.md`/`CLAUDE.md` for rule or command changes,
`docs/agents/review-lessons.md` for new root causes, and roadmap/status for milestone progress.
Verify claims against current code; separate requirements, implementation and live evidence.
If behavior changes without a documentation update, the PR body must contain a standalone
line starting with `Docs: not needed because` followed by the reason. CI `docs-check` gates
changes under `apps/`, `packages/`, `deploy/` and `.github/`; reviewers assess relevance,
freshness and exemptions. An unrelated Markdown edit does not meet this rule.

- [ ] Every affected Markdown file is updated; list files and corrections below.
- [ ] For a behavior change without docs, supply a standalone exemption line as described above.

Docs updated / reason:

## Linked issue and owned scope

## Validation evidence

- Tested head SHA:
- Commands/results and fixture IDs:
- Financial/tenant/retry implications, when relevant:
- Independent reviewer/provider:
- Remaining limitations:

## Pi live delivery (P1-P4, epic #45)

- Source/ledger/report consistency, when relevant:
- Migration/rollback impact:
- Exact deployed SHA and acceptance evidence (after deployment):
