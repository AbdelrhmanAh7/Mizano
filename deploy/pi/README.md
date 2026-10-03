# Mizano on Raspberry Pi 5

Tiny live deployment: Raspberry Pi 5 (8GB, arm64), Raspberry Pi OS 64-bit, Docker Engine + compose plugin, data on an attached SSD, private HTTPS through a Cloudflare Tunnel. Nothing here has been run on a Pi yet; treat every step as unverified until the first real deployment.

Memory budget (8GB): postgres 1.5G, redis 256M, api 1G, web 512M, cloudflared 128M, 2G reserved for the extraction worker, remainder for the OS and page cache.

## 1. Prepare the Pi

1. Flash Raspberry Pi OS Lite 64-bit, enable SSH with a key, disable password login, run `sudo apt update && sudo apt full-upgrade`.
2. Install Docker Engine and the compose plugin from Docker's apt repository. Add your user to the `docker` group.
3. Install `age`, `curl`, `jq`, `coreutils` and `util-linux` (`sudo apt install age curl jq coreutils util-linux`).
4. Mount the SSD at `/mnt/ssd` (ext4, `UUID=... /mnt/ssd ext4 defaults,noatime 0 2` in `/etc/fstab`), then:
   `sudo mkdir -p /mnt/ssd/mizano/{postgres,redis,originals,backups,monitor}`.
5. Use an official Pi power supply and active cooling; the health check alerts on undervoltage and throttling.

## 2. Get the deploy files (no source build on the Pi)

```bash
sudo git clone --depth 1 --filter=blob:none --sparse https://github.com/AbdelrhmanAh7/mizano /opt/mizano
cd /opt/mizano && sudo git sparse-checkout set deploy/pi
cp deploy/pi/.env.pi.example deploy/pi/.env.pi && chmod 600 deploy/pi/.env.pi
```

Fill `.env.pi` (generate secrets with `openssl rand -base64 48`). Never commit it.

## 3. Private HTTPS with Cloudflare Tunnel

The stack publishes **no ports**. The `cloudflared` container dials out to Cloudflare and forwards to the internal network.

Cloudflare Tunnel is the chosen ingress. Use **one hostname**, `app.example.com`,
forwarded to `http://gateway:8080`. The gateway sends `/api/*` to Nest except
NextAuth's `csrf`, `session`, `providers`, `signin`, `signout`, `callback` and
`error` actions under `/api/auth/`. Nest login/register/refresh/logout keep their
existing routes. `/socket.io/` reaches Nest on the same origin. There are no published ports.

Owner setup (requires a Cloudflare account and a domain):

1. Create a named tunnel in Cloudflare Zero Trust and put its token in the Pi-only
   `.env.pi` (`chmod 600`). Do not paste tokens into terminal commands or logs.
2. Add a public hostname `app.example.com` with service `http://gateway:8080`.
   Remove any old direct web/API hostnames and wildcard routes.
3. Require a Cloudflare Access email allow-list for this hostname. Enable WebSockets
   and do not cache authenticated HTML or `/api/*`. Cloudflare terminates HTTPS;
   the gateway supplies HTTPS forwarding headers to NextAuth.
4. Set `NEXTAUTH_URL` and `CORS_ORIGIN` to exactly `https://app.example.com`.
   Build the web image with `NEXT_PUBLIC_API_URL=https://app.example.com/api`
   in issue #38's pipeline. A runtime environment variable cannot change that
   compiled URL. Set `API_INTERNAL_URL=http://api:6001/api` for server-side login.
5. Set `MIZANO_GATEWAY_IMAGE` and `MIZANO_TUNNEL_IMAGE` to reviewed arm64
   gateway/cloudflared references pinned by digest before live deployment.
   No router port forwarding, UPnP mapping or direct app listener is needed.

The gateway blocks API diagnostics and the legacy internal webhook. API
`NODE_ENV=production` and `APP_ENV=prod` disable Swagger and development environment
selection; ingress and Nest rate limits are enabled. Ingress limits are shared
across the tunnel's source address, conservatively protecting the tiny pilot.

### Production settings checklist

- `NODE_ENV=production` is set by the compose file. `main.ts` enables Swagger (`/api/docs`) only when `NODE_ENV` is not `production`, so it is off here; there is no separate switch. Confirm: `curl -i https://app.example.com/api/docs` returns 404.
- `CORS_ORIGIN` must be exactly the web origin (HTTPS, no wildcard, no trailing slash). The API refuses to start in production without it.
- `NEXTAUTH_URL` is HTTPS so NextAuth issues secure cookies. Verify in browser dev tools that session cookies are `Secure` and `HttpOnly`.
- JWT and NextAuth secrets are unique, random, and at least 32 bytes.
- `OLLAMA_ENABLED=false`; no paid cloud AI.

### Verify no open ports

```bash
docker compose -f deploy/pi/docker-compose.pi.yml --env-file deploy/pi/.env.pi ps --format '{{.Name}} {{.Ports}}'
sudo ss -tlnp | grep -E ':(5001|6001|5432|6379|8080|2000)\b' || echo "no app ports listening on the host"
# from an external network scan the public IP; also scan the LAN IP:
nmap -Pn -p 22,80,443,5001,6001,5432,6379,8080,2000 <pi-ip>
```

Only SSH (ideally LAN-only) should answer. No container should list a published port.

## 4. First deploy

`deploy.sh` takes the commit SHA and the image digests from the CI build (#38). Repositories come from `MIZANO_API_IMAGE`/`MIZANO_WEB_IMAGE` in `.env.pi`.

```bash
deploy/pi/scripts/deploy.sh <commit-sha> sha256:<api-digest> sha256:<web-digest>
```

It pulls by digest, runs `prisma migrate deploy` (one-shot `migrate` service; the api only starts when it succeeds), restarts, waits for healthy, and appends `OK`/`FAILED` lines to `$MIZANO_DATA_DIR/deployments.log`. On failed health it rolls back to the previous recorded digests. Migrations are never reverted, so keep them backward compatible with the previous release.

## 5. Backups and restore drill

```bash
sudo cp deploy/pi/systemd/*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mizano-backup.timer mizano-healthcheck.timer
```

The units assume the repo at `/opt/mizano`; edit `ExecStart` otherwise, and ensure the user running them can use Docker (they run as root by default).

- Generate a key pair on your own machine: `age-keygen -o mizano-backup.key`. Put only the public key in `BACKUP_AGE_RECIPIENT`. Store the private key offline (password manager); the Pi must not hold it.
- `backup.sh` runs nightly at 02:30 Africa/Cairo: encrypted `pg_dump` (custom format) and a tar of `originals/` in `$MIZANO_DATA_DIR/backups`, retention `BACKUP_RETENTION_DAYS`, status in `backup.status`. Copy the folder off the Pi as well (a backup on the same SSD is not a disaster backup).
- Run a drill monthly and before every demo: `AGE_IDENTITY_FILE=/path/mizano-backup.key deploy/pi/scripts/restore-drill.sh`. It restores the latest dump into a scratch Postgres container, then checks that tables exist and journal debits equal credits.

## 6. Monitoring

Install `util-linux` (flock), `coreutils` (timeout), `jq`, and reapply `chmod 600 deploy/pi/.env.pi`.
Set `MONITOR_ORGANIZATION_ID` to the authorized pilot organization; queue counts
are scoped to this organization. Other organizations need separate monitoring.
The current intake worker runs within API: the check uses BullMQ live consumer
registration, not a fabricated worker HTTP endpoint. A dedicated worker endpoint
must be wired when a separate worker is introduced. This check proves registration,
not extraction correctness; run a real intake journey before go-live.

`mizano-healthcheck.timer` runs every five minutes. API health checks parse the
response body (HTTP 200 alone does not mean ready); web probes `/robots.txt`.
Dead letters come from the organization's persisted `IntakeJob` rows, since
BullMQ removes failed deliveries. A nonzero count stays in alert until cleared.
Checks include disk >80%, available RAM <300MB, temperature >=80 degrees C, current
throttling/undervoltage bits (historical bits do not prevent recovery), and failed,
missing or >26-hour-old backups. Unavailable probes produce their own alerts
and retain existing incidents until a successful probe confirms recovery.
Backup command failures record FAILED, including file rename/retention errors;
an OK requires encrypted database and original-document archives.

Owner Telegram setup: create/use the existing bot through BotFather, privately
send it `/start`, obtain the chat id through Telegram's API in a secure client,
and fill `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` in `.env.pi`. No credentials
are provided by default. Do not share `getUpdates` responses or invoice text.
Messages contain only fixed check keys. State is locked and stored with restrictive
permissions; only acknowledged Telegram deliveries are recorded, so failed alerts
and recoveries retry on the next timer tick. A lost Telegram response can cause a
repeat delivery; exactly-once delivery across network failures is not guaranteed.
Notification or locking failures exit 2 so systemd records failure; detected
incidents exit 1 after delivery. Lock contention skips the overlapping run.

Run the offline harnesses (no Docker, database or Telegram connection required):

```bash
for test in monitor-state pi-config health-probe monitor-resources healthcheck backup; do
  bash "deploy/pi/tests/$test.test.sh" || exit "$?"
done
bash deploy/pi/tests/compose-config.test.sh # Requires Docker CLI, no daemon.
```

The command harness mocks Telegram and locking; real lock concurrency and delivery
remain Pi acceptance checks. Failed/malformed resource probes raise stable probe
alerts instead of aborting before other incidents can be delivered.
On the Pi, simulate each alert and recovery (these send real messages to the configured
chat and use a separate simulation state, without stopping services):

```bash
for check in api web gateway tunnel worker queue disk memory temperature throttle backup; do
  sudo deploy/pi/scripts/healthcheck.sh --simulate "$check" || test "$?" -eq 1
  sudo deploy/pi/scripts/healthcheck.sh --simulate "$check" || test "$?" -eq 1
  sudo deploy/pi/scripts/healthcheck.sh --simulate recovery
done
```

Record one alert, no repeat on the second run, and one recovery per key in Telegram.
This is owner-run acceptance evidence, not a claimed test result.
Docker logs are capped at 3 files of 10MB per service; gateway access logging is disabled.
Install `systemd/journald-mizano.conf` as
`/etc/systemd/journald.conf.d/mizano.conf` and restart journald to bound host logs
(the limit applies to the entire host).

### Secret rotation and external acceptance

Keep `.env.pi` and backup/state directories accessible only to the operator/root.
Reapply modes after every copy. Rotate the tunnel token through Cloudflare, update
the file using a secure editor, then recreate cloudflared. Rotate the bot token with
BotFather and recreate API; restart the monitoring timer. Rotate JWT and NextAuth
secrets together and recreate API/web; all sessions must sign in again. Database
password rotation requires an operator SQL password change plus matching file URL
update; merely changing `POSTGRES_PASSWORD` does not change an existing database.
Never reset the database as a rotation step.

From an external network, after passing the Access allow-list, verify valid HTTPS,
Arabic/English login, refresh after access-token expiry, and logout (old refresh
token rejected). Inspect `Secure`/`HttpOnly` cookies and the same-origin browser
requests. `GET /api/invoices` without app authentication must return 401
(Cloudflare Access may reject earlier; test with an Access-authorized session).
Confirm `/api/docs`, `/api/internal/tunnel-update` and `/api/health`
return 404. Scan the public IP for app/database/cache ports and retain the results.
Local configuration checks cannot establish these acceptance points.

For the external HTTP checks, run `bash deploy/pi/tests/https-smoke.test.sh` from another network
with `PUBLIC_ORIGIN=https://app.example.com` and `ACCESS_COOKIE_FILE` pointing to
a private curl cookie jar containing only Cloudflare Access authorization (no app
session). It verifies certificate validation, the web probe, anonymous 401 and
blocked diagnostics. Do not use `curl -k`. Login/refresh/logout and the public-IP
scan remain manual acceptance steps above.

The `/api` public URL preserves the current web client's Socket.IO origin
derivation. Verify realtime events, authenticated reconnect and intake SSE through
the gateway on the Pi; configuration checks do not establish runtime delivery.

## 7. Upgrade and rollback

- Upgrade: run `deploy.sh` with the new SHA and digests (section 4).
- Manual rollback: `deploy/pi/scripts/rollback.sh` restores the previous `OK` digests from `deployments.log`.
- Back up before any upgrade that includes a migration: `sudo systemctl start mizano-backup.service`.

## Local review evidence and handoff

Review scope: [#40](https://github.com/AbdelrhmanAh7/Mizano/issues/40) and
[#43](https://github.com/AbdelrhmanAh7/Mizano/issues/43), based on
[PR #48](https://github.com/AbdelrhmanAh7/Mizano/pull/48). Local `master`,
`origin/master` and the worktree HEAD were `1d37f28ac87ba7ce6621fd09eb76664c51635eda`;
GitHub's current issue/head state was inaccessible. Review fixes remain uncommitted.
Provider: OpenAI Codex (GPT-6); the exact runtime model revision is not exposed.
This review supplies no independent approval of the reviewer's own fixes.

The special Windows runner `node apps/api/_run_tests.js` reproduces four
`csv is not a function` import failures on code identical to local master.
Its `_jest.config.js` forces `esModuleInterop=true`, unlike the API tsconfig;
the CSV namespace import then becomes an object. The regular Jest configuration
passes all 24 import tests. No application or shared test configuration was changed
for this pre-existing runner issue.

Local validation on this uncommitted diff (Node 25.6.1, Bash 5.3.15):

| Command                                                                                                             | Result                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Offline shell harness loop in section 6                                                                             | 146 cases/assertions plus 6 static contracts passed                                                                                     |
| `bash deploy/pi/tests/compose-config.test.sh`                                                                       | Rendered Compose contracts passed; Docker Compose 5.5.1, no daemon                                                                      |
| API/web `node ../../node_modules/jest/bin/jest.js --runInBand` from each app                                        | API 130 suites / 2,131 tests; web 46 suites / 437 tests passed                                                                          |
| API `jest --config test/jest-e2e.json --runInBand auth.e2e-spec.ts intake.e2e-spec.ts` via the same Node entrypoint | 2 suites / 53 tests passed after `prisma migrate deploy`; database `mizano_e2e_piops`, Redis at `127.0.0.1:6380/14`, extraction stubbed |
| `pnpm exec tsc --noEmit -p tsconfig.json`, API E2E `-p test/tsconfig.e2e.json`, web `pnpm exec tsc --noEmit`        | All passed                                                                                                                              |
| API `pnpm exec eslint --max-warnings 0 '{src,apps,libs,test}/**/*.ts'`                                              | Passed                                                                                                                                  |
| Web `pnpm exec eslint --max-warnings 0 . --ext .js,.ts,.tsx`                                                        | Blocked: 13 warnings in files identical to master; no app/shared package files changed                                                  |
| `pnpm --filter api build`, `pnpm --filter @mizano/web build`, `pnpm ci:full`                                        | Exit 0; existing test/toolchain/cache/runtime warnings remain, so this is not zero-warning acceptance                                   |

All shell scripts pass `bash -n`; shellcheck is unavailable. Changed Markdown/YAML
pass Prettier, and changed files use LF. No Codex run-checkpoint files were found.
Docker daemon access was denied; nginx/container execution and external HTTPS/
browser/Telegram acceptance remain unverified. Temporary `.piops-*` test artifacts
remain because automatic approval review rejected cleanup as blocked by policy;
do not stage these artifacts. The dedicated E2E database was retained without
resetting any existing database.

Owner handoff: run the external HTTPS script, Arabic/English browser auth and
realtime journeys, public/LAN port scans, and every Telegram simulation/recovery
on the exact reviewed Pi image digests. No Pi deployment or real Telegram delivery
was performed here. The user-assigned local review scope is released at handoff;
no shared lease registry was present or changed. The next task is independent
review of the final diff, followed by those owner acceptance steps.
