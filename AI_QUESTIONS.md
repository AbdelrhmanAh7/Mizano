# AI questions — issue #45

Issue #45 ("[Pi] Epic: tiny live deployment on Raspberry Pi 5 (8GB)") is the tracking
epic for the Pi go-live. AGENTS.md and docs/agents/README.md name it as such. The
implementer stopped before writing any code or tests, for these reasons:

1. **The work is too big for one PR.** The epic's checklist holds 20 child issues
   (#38–#44 platform, #8–#12/#19/#22 ledger correctness, #15–#18/#20/#21/#24/#42 intake and
   Telegram, #23/#44 verification). Each one is its own body of work. The owner rule caps a
   PR at ~300 changed lines and says to split bigger work into sequential issues. That split
   already exists: the child issues are the split.
2. **The epic has no acceptance criteria of its own.** Each checkbox is "close child #N".
   The E2E-first rule wants one failing test per acceptance criterion, but the only possible
   tests here would copy the child issues' tests. Those belong on the child branches
   (`ai/<n>`) where the behaviour gets built.
3. **Several items cannot be done or checked by an AI implementer:**
   - #40 private HTTPS, #41 exact-digest deploys and backups, #43 Telegram alerts: these
     need real hosts, tunnels and secrets. Agents must not touch secrets.
   - #24 and #44 need measurements and a go/no-go on the physical Raspberry Pi 5.
   - #11 says "close at Pi acceptance", which is a human decision.
   - #38 multi-arch images and parts of #41 likely change CI/deploy workflows. Owner rule:
     those stop at the owner.
4. **Backlog triage flagged it.** An earlier triage comment marked this issue "unclear or
   sensitive" and left it for a human or the High Board. A later comment queued it anyway.

## Child issue status (checked 2026-10-08)

Closed (6): #8, #9, #10, #15, #16, #19. The epic body still shows these as unticked.

Open (16): #11, #12, #17, #18, #20, #21, #22, #23, #24 (accounting, intake, verification)
and #38, #39, #40, #41, #42, #43, #44 (Pi platform).

A second run on 2026-10-08 found no owner answer on #45 or draft PR #122, so it stopped again
without code changes.

## Questions for the owner

- Should #45 be removed from the `ai-ready` queue and kept as a tracking epic only, with the
  AI engineers dispatched to its child issues one at a time?
- If you want something from this branch, which single child issue or narrow slice should
  `ai/45` deliver? For example: "tick the epic checklist from merged PRs", or one named
  child issue.
- Which child issues are cleared for AI work, given the secrets, hardware and CI limits
  in point 3?

No production code or tests were changed on this branch.
