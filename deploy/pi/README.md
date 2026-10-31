# Mizano on Raspberry Pi 5

Tiny live deployment: Raspberry Pi 5 (8GB, arm64), Raspberry Pi OS 64-bit, Docker Engine + compose plugin, data on an attached SSD, private HTTPS through a Cloudflare Tunnel. Nothing here has been run on a Pi yet; treat every step as unverified until the first real deployment.

Memory budget (8GB): postgres 1.5G, redis 256M, api 1G, web 512M, cloudflared 128M, 2G reserved for the extraction worker, remainder for the OS and page cache.

## 1. Prepare the Pi

1. Flash Raspberry Pi OS Lite 64-bit, enable SSH with a key, disable password login, run `sudo apt update && sudo apt full-upgrade`.
2. Install Docker Engine and the compose plugin from Docker's apt repository. Add your user to the `docker` group.
3. Install `restic`, `python3`, and `curl` (`sudo apt install restic python3 curl`). Use a restic build with `--stdin-from-command` support (checked by the scripts); the local drill uses 0.19.1. Keep `age` only if you need to read legacy backups.
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

The browser calls the API directly (`NEXT_PUBLIC_API_URL`, inlined into the web image at build time) and NextAuth lives on the web app at `/api/auth/*`, which collides with the Nest API's `/api/auth/*`. So use **two hostnames** instead of path routing:

| Hostname          | Service           | Notes                                                                  |
| ----------------- | ----------------- | ---------------------------------------------------------------------- |
| `app.example.com` | `http://web:5001` | `NEXTAUTH_URL`, `CORS_ORIGIN` = this origin                            |
| `api.example.com` | `http://api:6001` | web image built with `NEXT_PUBLIC_API_URL=https://api.example.com/api` |

Steps:

1. Cloudflare Zero Trust, Networks, Tunnels, create a tunnel (type `cloudflared`), copy the token into `CLOUDFLARE_TUNNEL_TOKEN`.
2. Add the two public hostnames above with the service URLs shown (the names `web` and `api` resolve on the compose network).
3. Optionally protect `app.example.com` with a Cloudflare Access policy (email allow-list) for a private demo.
4. The web image must be built for this API origin (issue #38 pipeline); deploying an image built for another origin breaks API calls.

Alternative: Tailscale. Run `tailscale serve` on the host for `http://127.0.0.1:5001`, which needs a published loopback port; keep the tunnel as primary. Private tailnet-only access is acceptable for a single-operator demo.

### Production settings checklist

- `NODE_ENV=production` is set by the compose file. `main.ts` enables Swagger (`/api/docs`) only when `NODE_ENV` is not `production`, so it is off here; there is no separate switch. Confirm: `curl -i https://api.example.com/api/docs` returns 404.
- `CORS_ORIGIN` must be exactly the web origin (HTTPS, no wildcard, no trailing slash). The API refuses to start in production without it.
- `NEXTAUTH_URL` is HTTPS so NextAuth issues secure cookies. Verify in browser dev tools that session cookies are `Secure` and `HttpOnly`.
- JWT and NextAuth secrets are unique, random, and at least 32 bytes.
- No AI by default; an organization may connect its own AI account in Settings → AI (optional `AI_OLLAMA_BASE_URL` for a self-hosted Ollama).

### Verify no open ports

```bash
docker compose -f deploy/pi/docker-compose.pi.yml --env-file deploy/pi/.env.pi ps --format '{{.Name}} {{.Ports}}'
sudo ss -tlnp | grep -E ':(5001|6001|5432|6379)\b' || echo "no app ports listening on the host"
# from another machine on the LAN:
nmap -Pn -p 22,80,443,5001,6001,5432,6379 <pi-ip>
```

Only SSH (ideally LAN-only) should answer. No container should list a published port.

MCP uses `MCP_PUBLIC_URL` when set, otherwise the origin of `PUBLIC_API_URL` (Pi), then
`NEXT_PUBLIC_API_URL` (server). Both public API settings may end in `/api`; the MCP and
OAuth routes are at the origin. Pass the actual public API hostname, never the web hostname.
Run `APP_ENV=prod pnpm env:check` for `.env.prod`, or
`pnpm env:check -- deploy/pi/.env.pi` for the Pi. It validates the effective origin without
printing addresses or secrets. With no public API setting, MCP stays off in production.
An HTTP or invalid fallback also keeps production MCP off; configure a public HTTPS API address.
The server nginx profile routes `/mcp`, `/oauth/*` and `/.well-known/oauth-*` to the API too;
when adding a TLS virtual host, retain those routes.

## 4. First deploy

`deploy.sh` takes the commit SHA and the image digests from the CI build (#38). Repositories come from `MIZANO_API_IMAGE`/`MIZANO_WEB_IMAGE` in `.env.pi`.

```bash
deploy/pi/scripts/deploy.sh <commit-sha> sha256:<api-digest> sha256:<web-digest>
```

It pulls by digest, runs `prisma migrate deploy` (one-shot `migrate` service; the api only starts when it succeeds), restarts, waits for healthy, and appends `OK`/`FAILED` lines to `$MIZANO_DATA_DIR/deployments.log`. On failed health it rolls back to the previous recorded digests. Migrations are never reverted, so keep them backward compatible with the previous release.

The server workflow follows the same gate: `docker compose -f docker-compose.production.yml
run --rm migrate` must succeed before restarting the API/web. A migration failure exits the
deploy and leaves the previous application containers running. Migrations must remain backward
compatible; a failed migration may still have changed the database and requires operator inspection.
This repository change does not run a deployment.

## 5. Backups and restore drill

`backup.sh` uses PostgreSQL's custom-format `pg_dump` and restic's encrypted, deduplicated
repository. One snapshot contains the dump, original files, and a checksum/accounting manifest.
An exported repeatable-read snapshot binds the dump and per-organization counts to the same
point in time while the app writes. Originals are immutable; a missing or changed original
fails the backup. New uploads after that database snapshot may be copied too.

1. Set `RESTIC_REPOSITORY` to your backup disk or existing off-machine restic repository.
   A repository on the application's SSD alone does not protect against loss of that SSD.
2. Put a strong repository password in your password manager, then provision its runtime copy
   at `RESTIC_PASSWORD_FILE` (absolute path, mode 0600 or 0400, outside Git). Never put the
   password itself in `.env.pi`, Git, terminal history, logs or this runbook. Keep remote-repository
   access credentials and the application's sealing key (`INTEGRATIONS_ENCRYPTION_KEY`) recoverable too.
3. Set stable `BACKUP_SET` and `BACKUP_HOST` labels for this installation. The host defaults
   to the current hostname; on another recovery machine, set it to the source host's label.
   Retention and snapshot selection filter by both host and application/set tags.
4. Initialize the new repository **once**, using those settings, then test a backup and drill:

```bash
set -a
. deploy/pi/.env.pi
set +a
restic init
# After first initialization, use the scripts; do not re-initialize for each run.
deploy/pi/scripts/backup.sh
deploy/pi/scripts/restore-drill.sh
```

The drill always creates a fresh Postgres container with no network or published ports,
restores originals into a private temporary directory, verifies dump/file hashes and each
intake file's stored SHA-256, compares counts per organization in 13 critical table groups,
and checks posted journal/organization balance, account tenancy, draft existence, and posted
intake document → journal links. It never accepts an existing target database URL. All scratch
containers and plaintext staging are removed on success or failure. Source data is read-only.
A restored source that already has broken/unverifiable posting links or unbalanced journals
fails the drill; the backup preserves source data as it was.

After the initial successful drill, install nightly backups (02:30 Africa/Cairo) and health checks:

```bash
sudo cp deploy/pi/systemd/*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mizano-backup.timer mizano-healthcheck.timer
```

Run a drill monthly and before release. Proposed targets: **RPO ≤ 24 hours**, **RTO ≤ 4 hours**.
These require the operator's actual schedule, off-machine repository and representative data;
the [local synthetic drill evidence](../../docs/evidence/first-client-ops/restore-drill.md)
does not establish live Pi/server recovery performance. Redis, host setup and runtime secrets
are separate recovery inputs. Existing `.age` backups are retained, not converted or deleted;
restore them with the [previous age runbook](https://github.com/AbdelrhmanAh7/Mizano/blob/a3f1630d05e20c8b149db2ea2e57f384a91cec4b/deploy/pi/README.md#5-backups-and-restore-drill) and its offline identity when necessary.

### Server compose

Use the same scripts with explicit paths and a private env file containing the restic settings:

```bash
ENV_FILE=/opt/mizano/.env COMPOSE_FILE=/opt/mizano/docker-compose.production.yml \
  BACKUP_ORIGINALS_CONTAINER_PATH=/app/apps/api/storage/intake \
  deploy/pi/scripts/backup.sh
ENV_FILE=/opt/mizano/.env COMPOSE_FILE=/opt/mizano/docker-compose.production.yml \
  deploy/pi/scripts/restore-drill.sh
```

Set `MIZANO_DATA_DIR` to a private host directory for backup status/staging. If the API uses
an explicit `INTAKE_STORAGE_DIR`, use that container path, or set `BACKUP_ORIGINALS_DIR` for
its host bind mount. `docker compose cp` reuses Docker's file-copy support for the server's
container path. This change does not move or deploy production files. The operator must set
up persistent original storage before replacing a container that holds the only originals.

Developer regression gates (run through the shared `heavy.sh` on the owner's Mac):

```bash
deploy/pi/scripts/test-backup-restore.sh  # offline checks + shellcheck
deploy/pi/scripts/test-restore-drill.sh   # full migrated disposable DB, real restic backup/restore
```

## 6. Monitoring

`mizano-healthcheck.timer` runs `healthcheck.sh` every 5 minutes: API and web health endpoints, the intake worker's container health, disk above 80%, low available memory, CPU temperature, throttling (`vcgencmd get_throttled`), and backup status older than 26 hours. Alerts and recovery messages go to Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`). Messages contain only short check names; no secrets or document data. A state file in `$MIZANO_DATA_DIR/monitor` suppresses repeats. Create the bot with BotFather and get the chat id from `getUpdates`.

## 7. Upgrade and rollback

- Upgrade: run `deploy.sh` with the new SHA and digests (section 4).
- Manual rollback: `deploy/pi/scripts/rollback.sh` restores the previous `OK` digests from `deployments.log`.
- Back up before any upgrade that includes a migration: `sudo systemctl start mizano-backup.service`.
