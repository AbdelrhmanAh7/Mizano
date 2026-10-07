# Evidence for Issue #97: credential rotation checklist and slice 2/3 decisions (PR #100)

Slice 1 is documentation only: no `apps/api` code changed, because the repository has no ETA/VAT notification client to attach a credential-age check to (see `AI_QUESTIONS.md`, item 1).

## Commits

| Field                                           | Value                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline** (`master` when the branch was cut) | `b83d72b4cfa358f3a6ba4be9d9f1b613ac9fe1f2`                                                                                                                           |
| **Merged `master`**                             | `615060ed6294e16375a1f1ea9385cb7e812cd24f` (#98), merge commit `bd2a619`; the add/add conflict on `EVIDENCE.md` was resolved by keeping this file                    |
| **Tested head**                                 | `d902a1eb8bf80eb5dc82b414cb26841287cb1740`: every check below ran on this commit with a clean working tree                                                           |
| **Evidence commit**                             | The commit that adds this file changes only `EVIDENCE.md`; it was format-checked in the working tree before committing, and the repository CI runs on the PR head    |
| **Host / tools**                                | macOS (Darwin arm64), git, prettier 3.8.1 (the version pinned in `pnpm-lock.yaml`; binary taken from a sibling checkout because this worktree has no `node_modules`) |

## Changed files (vs `master`)

- `AI_QUESTIONS.md`: slice 2 and slice 3 decisions with defaults (rotation metadata in `deploy/pi/.env.pi` wired through `deploy/pi/docker-compose.pi.yml`; anomaly rule with warm-up and nonzero floor).
- `deploy/pi/README.md`: production checklist item names the tokens to rotate and asks for the rotation date.
- `docs/agents/review-lessons.md`: three new root causes from the PR #100 review (Pi env wiring, ratio-alert floor, evidence SHA).
- `EVIDENCE.md`: this file.

## Round 1 review threads (PR #100)

| Thread               | Finding                                                | Fix                                                                                                       | Commit    |
| -------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------- |
| `AI_QUESTIONS.md:10` | `.env.prod` is not available to the Pi deployment      | Default moved to `.env.pi` + `docker-compose.pi.yml` `environment:` list, documented in `.env.pi.example` | `730135c` |
| `EVIDENCE.md:5`      | Baseline SHA labelled as tested; no checks run         | Baseline and tested head recorded separately; checks run at `d902a1e` with output below                   | this file |
| `AI_QUESTIONS.md:14` | Anomaly rule undefined for cold start or zero baseline | Warm-up (floor only until 7 full UTC days) and nonzero floor (`max(50/day, 2 × 30-day mean)`)             | `730135c` |

## Checks run at the tested head

### Format (prettier, the project config)

```text
$ git rev-parse HEAD
d902a1eb8bf80eb5dc82b414cb26841287cb1740
dirty-files=0

$ prettier --config .prettierrc --check AI_QUESTIONS.md EVIDENCE.md deploy/pi/README.md docs/agents/review-lessons.md
Checking formatting...
All matched files use Prettier code style!
exit=0
```

### Links and paths

Every backticked repo path or file name in the changed docs must exist; bare names (the existing style in `deploy/pi/README.md` and `review-lessons.md`) are resolved by basename against `git ls-files`.

```text
## links: every repo path or bare file name in the changed docs resolves (head d902a1e)
ok   AI_QUESTIONS.md -> apps/api/src/app.module.ts
ok   AI_QUESTIONS.md -> deploy/pi/.env.pi.example
ok   AI_QUESTIONS.md -> deploy/pi/docker-compose.pi.yml
ok   AI_QUESTIONS.md -> deploy/pi/scripts/healthcheck.sh
ok   AI_QUESTIONS.md -> deploy/pi/scripts/lib.sh
ok   EVIDENCE.md -> AI_QUESTIONS.md
ok   EVIDENCE.md -> deploy/pi/README.md
ok   EVIDENCE.md -> notifications.service.spec.ts  (resolves to: apps/api/src/modules/notifications/services/notifications.service.spec.ts )
ok   deploy/pi/README.md -> backup.sh  (resolves to: deploy/pi/scripts/backup.sh )
ok   deploy/pi/README.md -> deploy.sh  (resolves to: deploy/pi/scripts/deploy.sh )
ok   deploy/pi/README.md -> deploy/pi/scripts/rollback.sh
ok   deploy/pi/README.md -> healthcheck.sh  (resolves to: deploy/pi/scripts/healthcheck.sh )
ok   deploy/pi/README.md -> main.ts  (resolves to: apps/api/src/main.ts apps/web/.storybook/main.ts )
ok   docs/agents/review-lessons.md -> .coderabbit.yaml
ok   docs/agents/review-lessons.md -> .env.pi.example  (resolves to: deploy/pi/.env.pi.example )
ok   docs/agents/review-lessons.md -> common/dto/decimal-string.ts  (resolves to: apps/api/src/common/dto/decimal-string.ts )
ok   docs/agents/review-lessons.md -> common/utils/bank-cash-accounts.ts  (resolves to: apps/api/src/common/utils/bank-cash-accounts.ts )
ok   docs/agents/review-lessons.md -> common/utils/ledger-lock.ts  (resolves to: apps/api/src/common/utils/ledger-lock.ts )
ok   docs/agents/review-lessons.md -> docker-compose.pi.yml  (resolves to: deploy/pi/docker-compose.pi.yml )
missing=0
```

The three review-thread URLs in the task brief are external GitHub links and were not fetched (the sandbox proxy rejected the GitHub TLS handshake).

### Content

```text
## content: checklist item present
53:- Rotate integration credentials (≤90 days): Telegram bot token, Cloudflare tunnel token and any future ETA/VAT token. Record each rotation date; slice 2 of #97 will read it from `.env.pi`.

## content: slice 2 default names the pi files
compose-mentions=2
env-pi-mentions=3
env-prod-mentions=1      <- the one mention says .env.prod never reaches the Pi

## content: slice 3 default has warm-up and nonzero floor
24:- **Rule.** Alert when today's count exceeds `max(FLOOR, 2 × baseline)`, where `baseline` is the mean daily count over the last 30 full UTC days.
25:- **Absolute floor.** `FLOOR = 50` attempts per day per organization, configurable as `NOTIFY_ANOMALY_MIN_DAILY`. The floor is always nonzero, so a legitimate zero-volume baseline (new organization, quiet month) never turns the first ordinary notification into an alert.
26:- **Warm-up.** Until 7 full UTC days of history exist, only the floor applies and the ratio part is off. From day 8 to day 30 the baseline uses the full days available. Counts persist under `$MIZANO_DATA_DIR`, so a restart does not reset the warm-up.

## content: no credential values in changed docs
none
```

### No ETA/VAT client in the API (why slice 1 stops at docs)

```text
$ grep -rwi eta apps/api/src | wc -l
0
$ grep -rwil notify apps/api/src
apps/api/src/modules/notifications/services/notifications.service.spec.ts
```

The single `notify` hit is the in-app notifications spec, not an outbound ETA/VAT or invoice-notify sender.

### Not run locally

- `pnpm ci:full` (lint, type-check, unit tests): this worktree has no `node_modules` and the sandbox has no registry access, and no `.ts` file changed. The repository CI (`.github/workflows/ci.yml`) runs it on the PR head.

## Acceptance checklist (Tech Lead plan)

| Item                                                                           | Status                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Classification at the 89/90/91-day boundaries; malformed dates give `unknown`  | Not applicable in slice 1: no ETA integration, so no `credential-age` code (plan step 0) |
| No credential value appears in logs, asserted by a test                        | Not applicable in slice 1 (no code); the content grep above shows no values in the docs  |
| Release checklist contains the rotation item                                   | PASS: `deploy/pi/README.md` line 53                                                      |
| `AI_QUESTIONS.md` lists the slice 2 and slice 3 decisions, each with a default | PASS: items 2 and 3, defaults marked `_Default:_`                                        |
| `EVIDENCE.md` has real recorded output and the exact tested SHA                | PASS: tested head `d902a1eb8bf80eb5dc82b414cb26841287cb1740`, output above               |
| Under 300 changed lines; no CI or secrets files touched                        | PASS: `git diff --stat master..HEAD` is documentation only (see the PR diff)             |
