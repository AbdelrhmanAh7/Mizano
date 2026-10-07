# Evidence for Issue #97: credential rotation checklist and slice 2/3 decisions (PR #100)

Slice 1 is documentation only. No `apps/api` code changed: the repository has no ETA/VAT client to attach a credential-age check to, so the plan's step 0 applies (docs plus `AI_QUESTIONS.md`). The repository does have a manual outbound invoice e-mail sender; the code facts section below records it, and the slice 2 and 3 defaults now cover it.

## Commits

| Field                                           | Value                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline** (`master` when the branch was cut) | `b83d72b4cfa358f3a6ba4be9d9f1b613ac9fe1f2`                                                                                                                                                                                      |
| **Merged `master`**                             | `615060ed6294e16375a1f1ea9385cb7e812cd24f` (#98), merge commit `bd2a619`; the add/add conflict on `EVIDENCE.md` was resolved by keeping this file                                                                               |
| **Tested head**                                 | `4d8e4814f23bd46f19a41e43cf404350d7c94c0c`, the last content commit. Every check below ran on that commit with a clean tree plus this file in its final form                                                                    |
| **Evidence commit** (final PR head)             | The commit directly after `4d8e481` adds only this file. Verify with `git diff --stat 4d8e481..HEAD`, which must list `EVIDENCE.md` alone. If a later review round adds commits, the checks are rerun and this table is updated |
| **Host / tools**                                | macOS (Darwin arm64), git, prettier 3.8.1 (the version pinned in `pnpm-lock.yaml`; binary taken from a sibling checkout because this worktree has no `node_modules`), python3 for the link check                                |

## Changed files (vs `master`)

- `AI_QUESTIONS.md`: tracking section (merging PR #100 must not close #97; two follow-up issues drafted as `gh issue create` commands), corrected inventory of outbound senders, slice 2 and 3 defaults extended to the per-organization SMTP password and to `EmailLog` as the volume source.
- `deploy/pi/README.md`: production checklist item names the tokens to rotate, now including each organization's SMTP password, and asks for the rotation date.
- `docs/agents/review-lessons.md`: five root causes from the PR #100 reviews (Pi env wiring, ratio-alert floor, evidence SHA, slice PRs must not close the parent issue, grep the mechanism not the product name).
- `.gitignore`: ignores `deploy/pi/.env.pi` (the Pi runtime secrets file was not ignored before; the `.env.pi.example` template stays tracked).
- `EVIDENCE.md`: this file.

## Review threads (PR #100)

| Round | Thread               | Finding                                                                                 | Fix                                                                                                                                                                   | Commit    |
| ----- | -------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1     | `AI_QUESTIONS.md:10` | `.env.prod` is not available to the Pi deployment                                       | Default moved to `.env.pi` + `docker-compose.pi.yml` `environment:` list, documented in `.env.pi.example`                                                             | `730135c` |
| 1     | `EVIDENCE.md:5`      | Baseline SHA labelled as tested; no checks run                                          | Baseline and tested head recorded separately; checks run with output below                                                                                            | `fd94af2` |
| 1     | `AI_QUESTIONS.md:14` | Anomaly rule undefined for cold start or zero baseline                                  | Warm-up (floor only until 7 full UTC days) and nonzero floor (`max(50/day, 2 × 30-day mean)`)                                                                         | `730135c` |
| 2     | `AI_QUESTIONS.md:3`  | Merging slice 1 would close #97 (harness PR body says `Closes #97`)                     | Item 0: two follow-up issues drafted (slice 2, slice 3 including the invoice e-mail path), owner asked to file or re-link                                             | `480a6de` |
| 2     | `EVIDENCE.md:12`     | Tested head was not the final PR head; evidence commit vague                            | Tested head is the last content commit; evidence commit is last and changes only this file; all checks rerun at the new head                                          | this file |
| 2     | `EVIDENCE.md:101`    | Claimed no outbound invoice sender exists                                               | `POST /documents/invoice/:id/send` → `EmailService.sendInvoice` through the organization's SMTP settings is now recorded; VAT submit stays a local settlement journal | `480a6de` |
| 2     | `EVIDENCE.md:119`    | Diff-size / no-CI-paths row had no recorded output (thread text truncated in the brief) | Real `git diff --stat`, `--name-only` and path filter output recorded below                                                                                           | this file |

## Checks run at the tested head

### Format (prettier, the project config)

```text
$ git rev-parse HEAD
4d8e4814f23bd46f19a41e43cf404350d7c94c0c
dirty-files-other-than-EVIDENCE.md=0

$ prettier --config .prettierrc --check AI_QUESTIONS.md EVIDENCE.md deploy/pi/README.md docs/agents/review-lessons.md
Checking formatting...
All matched files use Prettier code style!
exit=0
```

### Links and paths

Every backticked repo path or file name in the changed docs must exist; bare names (the existing style in `deploy/pi/README.md` and `review-lessons.md`) are resolved by basename against `git ls-files`. Fenced code blocks are skipped because they hold pasted command output.

```text
## links: every repo path or bare file name in the changed docs resolves (head 4d8e481)
AI_QUESTIONS.md: exact-path-matches=8
  ok   vat-returns.service.ts  (basename -> apps/api/src/modules/tax/services/vat-returns.service.ts)
  skip Organization.smtpHost/smtpPort/smtpUser/smtpPassword  (code identifier, not a path)
  ok   .env.pi  (never committed: runtime copy of the tracked template deploy/pi/.env.pi.example)
  ok   deploy/pi/.env.pi  (never committed: ignored by .gitignore:16:deploy/pi/.env.pi; template deploy/pi/.env.pi.example)
EVIDENCE.md: exact-path-matches=8
  ok   deploy/pi/.env.pi  (never committed: ignored by .gitignore:16:deploy/pi/.env.pi; template deploy/pi/.env.pi.example)
  ok   .env.pi.example  (basename -> deploy/pi/.env.pi.example)
  ok   .env.pi  (never committed: runtime copy of the tracked template deploy/pi/.env.pi.example)
  ok   docker-compose.pi.yml  (basename -> deploy/pi/docker-compose.pi.yml)
  ok   review-lessons.md  (basename -> docs/agents/review-lessons.md)
deploy/pi/README.md: exact-path-matches=1
  ok   .env.pi  (never committed: runtime copy of the tracked template deploy/pi/.env.pi.example)
  ok   main.ts  (basename -> apps/api/src/main.ts apps/web/.storybook/main.ts)
  ok   deploy.sh  (basename -> deploy/pi/scripts/deploy.sh)
  ok   backup.sh  (basename -> deploy/pi/scripts/backup.sh)
  skip originals/  (runtime directory under the data dir, not a repo path)
  ok   healthcheck.sh  (basename -> deploy/pi/scripts/healthcheck.sh)
docs/agents/review-lessons.md: exact-path-matches=4
  ok   common/utils/ledger-lock.ts  (suffix -> apps/api/src/common/utils/ledger-lock.ts)
  ok   common/dto/decimal-string.ts  (suffix -> apps/api/src/common/dto/decimal-string.ts)
  ok   common/utils/bank-cash-accounts.ts  (suffix -> apps/api/src/common/utils/bank-cash-accounts.ts)
  ok   .env.pi  (never committed: runtime copy of the tracked template deploy/pi/.env.pi.example)
  ok   .env.pi.example  (basename -> deploy/pi/.env.pi.example)
  ok   docker-compose.pi.yml  (basename -> deploy/pi/docker-compose.pi.yml)
missing=0
exit=0
```

The review-thread URLs in the task brief are external GitHub links and were not fetched (the sandbox proxy rejects the GitHub TLS handshake).

### Content

```text
## content: Pi checklist item present
53:- Rotate integration credentials (≤90 days): Telegram bot token, Cloudflare tunnel token, each organization's SMTP password (`PATCH /organization/settings/email`, used by invoice e-mail) and any future ETA/VAT token. Record each rotation date; slice 2 of #97 will read it from `.env.pi` (host tokens) and per organization (SMTP).

## content: tracking section says the merge must not close #97 and drafts both follow-ups
5:### 0. Tracking: merging PR #100 must not close #97
gh-issue-create-lines=2

## content: slice 2 default names the pi files
compose-mentions=3
env-pi-mentions=9
env-prod-mentions=1   <- the one mention says .env.prod never reaches the Pi

## content: slice 3 default has warm-up, nonzero floor and reads EmailLog
13:  --body "Parent: #97 (slice 1 merged in #100). Outbound sender exists today: POST /documents/invoice/:id/send -> Ema
20:`apps/api/src` has no ETA (Egyptian Tax Authority) client: `grep -rwi eta apps/api/src` returns nothing, and VAT subm
38:- **Metric.** Count send _attempts_ per organization per UTC day, successes and failures alike, read from `EmailLog`
40:- **Absolute floor.** `FLOOR = 50` attempts per day per organization, configurable as `NOTIFY_ANOMALY_MIN_DAILY`. The
41:- **Warm-up.** Until 7 full UTC days of `EmailLog` history exist for the organization, only the floor applies and the

## content: invoice e-mail sender is named and separated from VAT filing
13:  --body "Parent: #97 (slice 1 merged in #100). Outbound sender exists today: POST /documents/invoice/:id/s
20:`apps/api/src` has no ETA (Egyptian Tax Authority) client: `grep -rwi eta apps/api/src` returns nothing, an
20:`apps/api/src` has no ETA (Egyptian Tax Authority) client: `grep -rwi eta apps/api/src` returns nothing, an

## content: no credential values in changed docs (32+ char tokens after masking 40-hex SHAs, or assignments to TOKEN, SECRET, PASSWORD or KEY variables)
exit=0
```

### Code facts behind the docs (outbound senders)

No ETA client; one SMTP-based invoice e-mail sender that reads the organization's SMTP columns and logs every attempt; VAT submit makes no network call and posts a local journal.

```text
$ grep -rwi eta apps/api/src | wc -l
0
$ grep -rln "nodemailer\|sendMail(\|createTransport" apps/api/src --include=*.ts | grep -v .spec.ts
apps/api/src/modules/documents/services/email.service.ts
$ grep -n "invoice/:id/send\|emailService.sendInvoice" apps/api/src/modules/documents/controllers/documents.controller.ts
69:  @Post('invoice/:id/send')
80:    return this.emailService.sendInvoice(orgId, id, dto);
$ grep -n "smtpHost: true\|smtpPassword: true\|createTransport" apps/api/src/modules/documents/services/email.service.ts
394:        smtpHost: true,
397:        smtpPassword: true,
409:    const transporter = nodemailer.createTransport({
$ grep -n "emailLog.create" apps/api/src/modules/documents/services/email.service.ts | head -2   # invoice path: sent and failed
86:      const emailLog = await this.prisma.emailLog.create({
101:      await this.prisma.emailLog.create({
$ grep -rn "fetch(\|axios\|HttpService\|https\?://" apps/api/src/modules/tax --include=*.ts | grep -v .spec.ts | wc -l
0
$ grep -n "journalsService.create\|JournalSourceType.VAT_RETURN" apps/api/src/modules/tax/services/vat-returns.service.ts | head -3
44:  JournalSourceType.VAT_RETURN,
316:        await this.journalsService.create(
324:          { tx, source: { type: JournalSourceType.VAT_RETURN, id: vatReturn.id } },
```

### Diff size and touched paths

Measured against `master` with this file in the tree, before this block was pasted (the block adds its own lines only).

```text
$ git diff --stat master
 .gitignore                    |   2 +
 AI_QUESTIONS.md               |  45 ++++++
 EVIDENCE.md                   | 310 ++++++++++++++++++++++--------------------
 deploy/pi/README.md           |   1 +
 docs/agents/review-lessons.md |   7 +-
 5 files changed, 220 insertions(+), 145 deletions(-)
$ git diff --name-only master | grep -E "^\.github/|secret|\.env" || echo "no CI, secrets or .env path touched"
no CI, secrets or .env path touched
$ git diff --numstat master | awk '{a+=$1; d+=$2; if ($3!="EVIDENCE.md") {ca+=$1; cd+=$2}} END {print "added="a" deleted="d" total="a+d"; excluding the per-PR EVIDENCE.md replacement: added="ca" deleted="cd" total="ca+cd}'
added=220 deleted=145 total=365; excluding the per-PR EVIDENCE.md replacement: added=54 deleted=1 total=55
final EVIDENCE.md after this block was pasted: EVIDENCE.md added=177 deleted=144; all files added=231 deleted=145 total=376
```

### Not run locally

- `pnpm ci:full` (lint, type-check, unit tests): this worktree has no `node_modules` and the sandbox has no registry access, and no TypeScript file changed. The repository CI (`.github/workflows/ci.yml`) runs it on the PR head.

## Acceptance checklist (Tech Lead plan)

| Item                                                                           | Status                                                                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Classification at the 89/90/91-day boundaries; malformed dates give `unknown`  | Not applicable in slice 1: no ETA integration, so no `credential-age` code (plan step 0); slice 2 issue drafted |
| No credential value appears in logs, asserted by a test                        | Not applicable in slice 1 (no code); the content grep above shows no values in the docs                         |
| Release checklist contains the rotation item                                   | PASS: `deploy/pi/README.md` line 53                                                                             |
| `AI_QUESTIONS.md` lists the slice 2 and slice 3 decisions, each with a default | PASS: items 2 and 3, defaults marked `_Default:_`; item 0 keeps #97 open for them                               |
| `EVIDENCE.md` has real recorded output and the exact tested SHA                | PASS: tested head `4d8e4814f23bd46f19a41e43cf404350d7c94c0c`, output above                                      |
| Under 300 changed lines; no CI or secrets files touched                        | See the diff block above: no `.github/`, secrets or `.env` path is touched; line count stated there             |
