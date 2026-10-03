# Mizano on Raspberry Pi 5

Tiny live deployment: Raspberry Pi 5 (8GB, arm64), Raspberry Pi OS 64-bit, Docker Engine + compose plugin, data on an attached SSD, private HTTPS through a Cloudflare Tunnel. This guide does not establish that any step has run on a Pi; require exact-SHA/digest health, restore and accountant-journey evidence before claiming readiness (epic #45, P1–P4).

Memory budget (8GB): postgres 1.5G, redis 256M, api 1G, web 512M, cloudflared 128M, 2G reserved for the extraction worker, remainder for the OS and page cache.

## 1. Prepare the Pi

1. Flash Raspberry Pi OS Lite 64-bit, enable SSH with a key, disable password login, run `sudo apt update && sudo apt full-upgrade`.
2. Install Docker Engine and the compose plugin from Docker's apt repository. Add your user to the `docker` group.
3. Install `age` (`sudo apt install age`) and `curl`.
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
- `OLLAMA_ENABLED=false`; no Ollama/LLM, GPU, Colab or paid cloud AI in the live intake path.

### CPU intake readiness

The current Compose API mounts `originals/` and runs the PostgreSQL/BullMQ intake processor
inside its 1GB API container. The 2GB extraction-worker budget is a commented reservation,
not an enabled service. `RulesStrategy` uses native PDF text (`pdf-parse`) and Tesseract image
OCR. The live target also requires Poppler for scanned PDFs; it is not present in this code path.

Before live acceptance, runtime work must pass `INTAKE_EXTRACTION_STRATEGY=rules` and
`INTAKE_TESSDATA_DIR` into the API/worker and package pinned `eng`/`ara` assets in the image.
Current Compose does not pass those settings, and the API Dockerfile does not package assets
or Poppler. Disabling Ollama alone does not force rules extraction: request scan presets can
still override the mode. Without a tessdata path Tesseract may download assets at runtime.
Rules return header fields with empty line items; complete automated draft preparation/batch
posting and scanned-PDF OCR are not proven. See [Architecture](../../docs/ARCHITECTURE.md#pi-invoice-pipeline).

Telegram settings here support operator alerts; they do not implement inbound invoice ingestion.
Update this README in the same PR as any deployment command/configuration/readiness change.

### Verify no open ports

```bash
docker compose -f deploy/pi/docker-compose.pi.yml --env-file deploy/pi/.env.pi ps --format '{{.Name}} {{.Ports}}'
sudo ss -tlnp | grep -E ':(5001|6001|5432|6379)\b' || echo "no app ports listening on the host"
# from another machine on the LAN:
nmap -Pn -p 22,80,443,5001,6001,5432,6379 <pi-ip>
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

`mizano-healthcheck.timer` runs `healthcheck.sh` every 5 minutes: API `/api/health` and web `/robots.txt` probes, disk above 80%, low available memory, CPU temperature, throttling (`vcgencmd get_throttled`), and backup status older than 26 hours. Alerts and recovery messages go to Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`). Messages contain operational check names and measurements; no secrets or document data. A state file in `$MIZANO_DATA_DIR/monitor` suppresses repeats. Create the bot with BotFather and get the chat id from `getUpdates`.

## 7. Upgrade and rollback

- Upgrade: run `deploy.sh` with the new SHA and digests (section 4).
- Manual rollback: `deploy/pi/scripts/rollback.sh` uses the active `OK`/`ROLLBACK` pointer in `deployments.log` to select the previous good digests; repeated manual rollback can move further back. A failed deployment restores the last active good release.
- Back up before any upgrade that includes a migration: `sudo systemctl start mizano-backup.service`.
