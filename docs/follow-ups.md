# AI Questions / Follow-ups

Durable notes for things that could not be resolved inside one PR and need a
decided follow-up. Each entry cross-references the issue(s)/PR(s) it depends on.

---

## Follow-up: merge the CPU extraction worker (depends on #42)

- **When**: after issue #42 lands (PR #93, branch `ai/42`).
- **Context**: issue #133 ([audit] Move intake extraction out of the API process
  and remove dead Colab wiring) scoped its PR to small, safe fixes: dead Colab
  wiring removal, scheduler gating, notifications pagination and acceptance
  tests. The **worker merge** (moving the BullMQ extraction `Worker` out of the
  API process into its own container, per the CPU extraction runtime on the Pi)
  was deliberately left out: it depends on issue #42 delivering the CPU-only
  extraction runtime with pinned Arabic/English assets first.
- **Blocking PRs** (do not merge here):
  - PR #93 / branch `ai/42` — CPU extraction runtime on the Pi 5 with pinned
    Arabic/English assets (issue #42).
  - PR #92 / branch `ai/39` — Pi 5 compose profile with an 8GB memory budget and
    SSD storage (issue #39).
- **Ready state**: `deploy/pi/docker-compose.pi.yml` already reserves a
  commented-out `worker` service and `deploy/pi/.env.pi.example` documents
  `AI_SCHEDULERS_ENABLED=false`. Once the worker container exists, flip the
  profile on and update `CLAUDE.md` (its "Target (not implemented yet)" note).
