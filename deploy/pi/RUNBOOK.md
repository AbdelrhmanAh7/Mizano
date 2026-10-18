# Pi live acceptance runbook (#44)

Use this checklist for the first live demo and each release candidate on a Raspberry Pi 5
(8GB, arm64). The operator prepares the platform; the accountant performs the journey.
The [acceptance contract](../../docs/strategy/demo-acceptance.md) decides GO/NO-GO.
This document records no passing live result. An unchecked item is unverified, never a pass.

## 1. Open the acceptance record

- [ ] Name the operator, accountant, release coordinator and escalation contact; reserve a
      maintenance window for restart, alert and rollback drills. Stop on an unsafe failure and
      send the coordinator a redacted blocker with issue, owner and next step.
- [ ] Record issue #44 / epic #45, release PRs, full candidate SHA, independent reviewer/provider,
      exact tested head, CI/build results and immutable API/web image digests from the release pipeline.
      Required CI and seeded API/browser acceptance must pass; local unit tests are not live proof.
- [ ] Record UTC start/end times, Pi hostname, fixture/corpus version and approved performance limits.
      Keep an evidence index with one row per checkbox: PASS / FAIL / BLOCKED / NOT RUN,
      artifact location, measured result, owner and timestamp.
- [ ] Use synthetic invoices and isolated demo organizations. Keep screenshots/report figures in
      restricted acceptance artifacts. Logs and alerts contain only safe metadata: never document
      text, amounts, tokens, credentials or auth headers. Do not capture `.env.pi`, full Docker
      inspection output, rendered compose configuration or unredacted network traces.

Commands below run in Bash from `/opt/mizano` on the Pi, unless another host is named.
Replace angle-bracket placeholders; they are not literal arguments. Follow the existing
[README](README.md), [compose file](docker-compose.pi.yml) and scripts; do not build on the Pi.

## 2. Hardware, SSD, OS and Docker

- [ ] Confirm Raspberry Pi 5, 8GB RAM, 64-bit Raspberry Pi OS Lite, official power supply,
      active cooling and attached ext4 SSD. Record model, OS/kernel, architecture, memory,
      SSD model/capacity/free space, temperature and `vcgencmd get_throttled` result.
- [ ] Complete [README preparation](README.md#1-prepare-the-pi): SSH keys, password login
      disabled, OS updates, Docker Engine/compose plugin, `age` and `curl`.
- [ ] Verify the SSD is actually mounted at `/mnt/ssd` via its `/etc/fstab` UUID, including
      after reboot. Do not deploy against an unmounted directory on the system card.
      Confirm `postgres`, `redis`, `originals`, `backups` and `monitor` under `/mnt/ssd/mizano`
      exist and are writable by their intended services; record checks without dumping files.
- [ ] Record Docker/compose versions and arm64 support of the release images. Preserve the
      README memory budget, including 2GB for extraction; run expensive drills sequentially.

## 3. Deployment files and environment

- [ ] Obtain the deployment files through [README section 2](README.md#2-get-the-deploy-files-no-source-build-on-the-pi).
      Record their checkout SHA separately from the application image SHA. Use the reviewed
      release's deployment files; the README clone command alone does not pin a release.
- [ ] Copy [`.env.pi.example`](.env.pi.example) to `.env.pi` as documented, set mode 600,
      fill all required values privately and confirm no placeholders remain. Do not overwrite
      an existing operator-managed file. Scripts source this file as Bash: use trusted,
      shell-safe values and do not enable shell tracing.
- [ ] Check `MIZANO_API_IMAGE`/`MIZANO_WEB_IMAGE` repositories, SSD `MIZANO_DATA_DIR`,
      database user/name/password and URL-encoded `DATABASE_URL`. Compose uses `postgres:5432`
      and `redis:6379` internally; those service names are not host loopback ports.
- [ ] Set unique random `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET` using the
      README generator. Set `NEXTAUTH_URL` and exact `CORS_ORIGIN` to the HTTPS web origin.
- [ ] Confirm the web image was built with `NEXT_PUBLIC_API_URL=https://<api-host>/api`.
      `PUBLIC_API_URL` in `.env.pi` is only an operator reference, not a runtime override.
- [ ] Set `CLOUDFLARE_TUNNEL_TOKEN`, monitoring `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ALERT_CHAT_ID`,
      `BACKUP_AGE_RECIPIENT` public key and `BACKUP_RETENTION_DAYS`. Keep the age private identity
      offline. Confirm `OLLAMA_ENABLED=false`, CPU-only extraction and pinned built-in language
      assets: no GPU, Colab, paid API, runtime model download or unapproved external model.
- [ ] Verify the candidate's actual extraction service and Telegram ingestion setup. This compose
      file reserves worker memory but has **no enabled worker service**; alert bot configuration
      does **not** establish invoice ingestion. Missing implementation/configuration is NO-GO;
      do not invent a worker start command or ingestion environment variable.

## 4. Deploy immutable images and verify HTTPS

For an upgrade, take the backup in section 5 first. Confirm migrations are backward compatible
with the recorded rollback target. Never reset the database to make acceptance pass.

```bash
deploy/pi/scripts/deploy.sh <commit-sha> sha256:<api-digest> sha256:<web-digest>
docker compose -f deploy/pi/docker-compose.pi.yml --env-file deploy/pi/.env.pi ps --format '{{.Name}} {{.Ports}}'
```

- [ ] Capture deploy start/end/duration, command exit status, migration result and safe health
      summary. [deploy.sh](scripts/deploy.sh) pulls API/web by digest, migrates and waits up to
      300 seconds for API/web health; [lib.sh](scripts/lib.sh) persists successful refs/SHA in
      `.env.pi`. Record only those three non-secret keys and the relevant `deployments.log` lines.
- [ ] Verify running image identities match the approved digests, not just the supplied SHA label.
      Also record resolved postgres/redis/cloudflared image identities: compose currently uses
      tags for these services, so they are not pinned by the API/web deploy arguments.
- [ ] Check the actual last active `OK`/`ROLLBACK` record: a failed candidate health check can
      automatically roll back and return success. Exit zero alone does not prove the candidate
      deployed. Pull/migration errors can terminate before a `FAILED` record or automatic rollback.
- [ ] Configure the two hostnames in [README section 3](README.md#3-private-https-with-cloudflare-tunnel):
      web → `http://web:5001`, API → `http://api:6001`. Keep NextAuth and Nest auth on their
      separate hosts. If Access protects the web host, verify authorized browser/API requests work.
- [ ] Verify HTTPS certificate, login, secure HttpOnly session cookies, permitted CORS and a
      rejected foreign origin. Verify API `/api/health` and web `/robots.txt`; production
      `/api/docs` must return 404. A required application feature returning 404 is a failure.
- [ ] Run the README no-open-ports checks on the Pi and from another LAN machine. Record that
      API/web/Postgres/Redis have no published ports; only permitted SSH should answer.
      The compose API health probe currently uses a hostname inconsistent with the repository's
      loopback guidance; record any actual failure and route a code fix, without changing this lane's scope.

## 5. Encrypted backup and restore drill

Install the supplied units as in [README section 5](README.md#5-backups-and-restore-drill):

```bash
sudo cp deploy/pi/systemd/*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mizano-backup.timer mizano-healthcheck.timer
sudo systemctl start mizano-backup.service
```

- [ ] Check both timers' next execution: backup at 02:30 Africa/Cairo, health every five minutes.
      The units use `/opt/mizano` and run as root by default; verify Docker access and paths.
- [ ] Confirm [backup.sh](scripts/backup.sh) completed: matching timestamped `db-*.dump.age`
      and `originals-*.tar.age`, no incomplete `.part` files accepted, and fresh `backup.status`
      beginning `OK`. An OK database backup alone does not prove originals were included.
      Capture duration, encrypted filenames/checksums, size and off-Pi copy verification.
- [ ] Quiesce intake/posting during the acceptance backup to obtain a consistent DB/originals
      pair; the script dumps DB then archives files, not an atomic application snapshot.
- [ ] Run [restore-drill.sh](scripts/restore-drill.sh) with a temporarily supplied offline identity
      using the operator's approved secure access procedure. Remove temporary identity access
      after the drill; never retain the private key on the Pi or in evidence.

```bash
AGE_IDENTITY_FILE=/path/mizano-backup.key deploy/pi/scripts/restore-drill.sh
```

- [ ] Record exit status, duration, restored table count and per-posted-journal balance result.
      The script restores the latest DB dump into a throwaway Postgres container and removes
      it afterwards; it does not restore originals, inspect application links or prove report totals.
- [ ] Complete a separate isolated application restore with the matching originals archive,
      using an operator-reviewed procedure for this exact candidate. Compare original checksums,
      original → extraction/version → corrected draft → approval → journal/payment links,
      tenant ownership and the report figures from section 7. Capture counts and discrepancies.
      There is no supplied full application restore script: until this procedure is available and
      successfully run, mark this gate BLOCKED/NO-GO. Never restore over the live database.

## 6. Monitoring alerts and recovery

- [ ] Run [healthcheck.sh](scripts/healthcheck.sh), directly or through its installed service:

```bash
sudo systemctl start mizano-healthcheck.service
```

- [ ] Verify checks for API `/api/health`, web `/robots.txt`, disk usage >80%, available RAM
      <300MB, CPU temperature >=80°C, nonzero throttle flags, and missing/failed/>26h-old
      backup status. Save sanitized check names and timestamps only.
- [ ] In the maintenance window, deliberately stop web, run the check twice, restart web,
      wait for healthy and run it again:

```bash
docker compose -f deploy/pi/docker-compose.pi.yml --env-file deploy/pi/.env.pi stop web
sudo systemctl start mizano-healthcheck.service
sudo systemctl start mizano-healthcheck.service
docker compose -f deploy/pi/docker-compose.pi.yml --env-file deploy/pi/.env.pi start web
sudo systemctl start mizano-healthcheck.service
```

- [ ] Capture one Telegram alert, no repeated alert for the same stable key, and one recovery.
      Inspect recovery only after health is restored. Restore normal operation even if the drill
      fails. Do not fill the disk or overheat hardware to test resource thresholds.
- [ ] Receipt in the alert chat is required: the script silently skips unset Telegram credentials
      and suppresses send failures; systemd accepts exit 1 as success. Neither proves notification delivery.

## 7. Seeded accountant journey: English, Arabic, desktop and 375px

Before the window, prepare two isolated EGP organizations A/B with authorized accountant accounts,
chart/default accounts, cash/bank, supplier/customer, 14% tax and open/locked periods through approved
application flows. Record seed manifest, dates/due dates and expected ledger deltas. Do not run a
broad development seed or E2E cleanup against live data. The existing
[accountant API journey](../../apps/api/test/accountant-journey.e2e-spec.ts) is a supporting test,
not a browser seed command or Telegram acceptance result.

Use equivalent fresh fixtures with unique references for each of **en desktop, ar desktop,
en 375px and ar 375px**; capture all four runs. Arabic must show RTL and localized actions/errors.
Every step below needs timings and screenshots with fixture/source IDs in the restricted evidence index.

1. [ ] Log in as A. Verify B cannot read A's originals, jobs, progress streams, drafts, journals,
       payments or reports. Record anonymous rejection and expired-session/reconnect behavior;
       use approved negative test cases, not guessed endpoints. Check concurrent refresh isolation.
2. [ ] Send a readable Arabic supplier invoice as a **document** to the configured private
       Telegram channel. Record message received → original persisted → queued → running →
       ready/exception timestamps. No scan-mode click or web re-upload may substitute for ingestion.
3. [ ] Web-upload native PDF, scanned/mixed multi-page PDF, DOCX, legacy DOC and phone image.
       Verify page-two totals, complete lines and downloadable originals. Include unreadable,
       encrypted, corrupt and oversized fixtures: explicit exceptions/rejection with correction
       or resubmit, never truncated success. Observe loading, empty, error and reconnect states.
4. [ ] Verify supplier matching, duplicate detection and source/version evidence. Replay a
       Telegram update, retry/double-click one upload and restart the implemented extraction
       service via its reviewed procedure. Require at most one active draft/posting per source.
       Recover a queued job after Pi reboot; if recovery needs undocumented intervention, fail.
5. [ ] In the inbox, compare source and fields, correct flagged values, and inspect correction
       audit. Missing currency, mismatched totals and foreign-tenant accounts stay exceptions.
       Select a valid batch and explicitly approve **once**. No posting before authorized approval;
       an invalid selected item must not silently post. Record per-item outcomes and approval audit.
6. [ ] Check scan and manual entry both preserve quantity `2`, rate `100.0000`, tax percentage
       `14`: net `200.0000`, tax amount `28.0000`, gross `228.0000` EGP. Add decimal,
       line/header-discount and mixed-tax fixtures with precomputed Decimal expectations.
       Require balanced journals and fixed 4-dp API strings; record posting IDs and exact deltas.
7. [ ] Record a manual partial supplier payment `100.0000`: the fixture bill's remaining AP is
       `128.0000`. Repeat the same action using its original idempotency identity; no duplicate
       journal/allocation. Record a customer invoice and receipt fixture too, proving AR as well
       as AP. Opening balances must be posted journals, not extra report-only amounts.
8. [ ] At identical explicit dates/currency, reconcile AR/AP aging to open documents net of
       unapplied credits and ledger control accounts; trial-balance debits = credits; P&L agrees
       with posted income/expense lines; balance-sheet assets = liabilities + equity including
       current earnings. Cash/bank equals posted balances. Record before/after figures and
       exports, account mapping and reconciliation differences (required `0.0000`).
9. [ ] Drill charts/report rows into the same ledger/source records. Drafts stay separate;
       future dates and later reversals obey as-of/period filters. Demonstrate a linked reversal,
       unchanged source history, locked-period rejection on single/bulk routes and concurrent
       approval without duplicate posting. No autonomous payment execution or statutory submission.
10. [ ] Process the contract's 20-document batch sequentially within the Pi budget; record
        throughput, warm/cold p50/p95 and peak RAM, including extraction/service versions.
        Evaluate readable holdout critical-header exact match with numerator/denominator and slices;
        uncertain fields require repair regardless of average accuracy. Preserve per-format timings.

Record every additional operator action. Only the documented setup, corrections, explicit approval,
manual payment and planned drill steps are expected; hidden DB edits, job repair, restarts needed to
finish ordinary ingestion or an undocumented seed workaround make the full-flow gate fail.

## 8. Rollback drill

- [ ] Identify the active record and a previous compatible good SHA/digest pair in
      `deployments.log`. First deployment with no previous good record cannot prove rollback;
      prepare a reviewed known-good target before sign-off.
- [ ] With backup verified and intake/posting quiesced in the maintenance window, run:

```bash
deploy/pi/scripts/rollback.sh
```

- [ ] Capture target and actual active SHA/digests, `ROLLBACK` line, `.env.pi` persisted refs,
      health, HTTPS login, original access and ledger/report invariants. [rollback.sh](scripts/rollback.sh)
      does not reverse migrations. Repeated manual rollback moves further back through good
      deployments; inspect the active pointer before each invocation, never retry blindly.
- [ ] If rollback is unhealthy or schema-incompatible, stop writes and escalate to the operator's
      recovery procedure. Record NO-GO; do not improvise a destructive live restore.
- [ ] Redeploy the intended candidate with the exact section 4 digests, then recheck active
      identity, health and relevant acceptance evidence. Sign-off binds to the final running release.

## 9. GO / NO-GO and evidence handoff

**GO requires every required gate PASS on the final candidate on this Pi**, with accountant and
operator names/timestamps. Use the [contract gates](../../docs/strategy/demo-acceptance.md#pass-criteria-and-evidence):
security, accounting, formats, automation/recovery, OCR quality, CPU performance, delivery and UX.
The contract targets >=95% readable-holdout critical-header exact match and provisional warm
p95 <=30s for supported <=3-page invoices; record actual measurements, not estimates.

**NO-GO** for any failed, blocked, not-run or missing required evidence, including absent CPU
extraction/Telegram ingestion, wrong active digest, unbalanced/unreconciled figures, cross-tenant
access, lost originals/audit, duplicate posting, bypassed approval/locks, missing restore/rollback
proof, undelivered alerts, OOM/crash or missing language/viewport coverage. Do not lower a gate
because a dependency is pending; name the gap and responsible issue/owner.

Attach a final record containing candidate/tested/deployed SHA and all resolved image identities;
CI/review and issue/PR links; hardware/OS/software versions; seed/corpus manifest; stage timings
and benchmark denominators; four language/viewport screenshot sets; report exports/reconciliation;
backup/off-Pi/isolated restore proof; alert/recovery and rollback proof; every extra intervention;
remaining blockers; final GO/NO-GO reason and signed operator/accountant decision. Keep credentials
out of the record. Resume only when the coordinator assigns fixes and a new exact-candidate rerun.
