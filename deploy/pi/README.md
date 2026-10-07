# Mizano on Raspberry Pi 5

Tiny live deployment: Raspberry Pi 5 (8GB, arm64), Raspberry Pi OS 64-bit, Docker Engine + compose plugin, data on an attached SSD, private HTTPS through a Cloudflare Tunnel. Nothing here has been run on a Pi yet; treat every step as unverified until the first real deployment.

Memory budget (8GB), enforced as hard container limits in `docker-compose.pi.yml`:

| Service     | Limit | Notes                                                                                                         |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| postgres    | 1.5G  | `shared_buffers=384MB`, `effective_cache_size=1GB`, `work_mem=8MB`, `max_connections=40`, SSD planner costs   |
| redis       | 256M  | `maxmemory 192mb`, `noeviction` (queue data must not be evicted), AOF on the SSD                              |
| api         | 1G    | V8 heap capped at 768M; enqueues intake jobs only (`INTAKE_WORKER_ENABLED=false`)                             |
| worker      | 2G    | `node dist/worker.js` from the api image; CPU OCR/rules extraction, one document at a time, heap capped 1536M |
| web         | 512M  | Next.js standalone, heap capped at 384M                                                                       |
| cloudflared | 128M  | reverse proxy (Cloudflare Tunnel), outbound only                                                              |
| **total**   | 5.5G  | about 2.5G left for the OS, Docker and page cache; `migrate` (768M) is a one-shot before api/worker start     |

`memswap_limit` equals `mem_limit` for every service, so a container that outgrows its budget is restarted by its own limit rather than pushing the whole Pi into swap.

## 1. Prepare the Pi

1. Flash Raspberry Pi OS Lite 64-bit, enable SSH with a key, disable password login, run `sudo apt update && sudo apt full-upgrade`.
2. Install Docker Engine and the compose plugin from Docker's apt repository. Add your user to the `docker` group.
3. Install `age` (`sudo apt install age`) and `curl`.
4. Mount the SSD at `/mnt/ssd` (ext4, `UUID=... /mnt/ssd ext4 defaults,noatime,nofail 0 2` in `/etc/fstab`), then:

   ```bash
   sudo mkdir -p /mnt/ssd/mizano/{postgres,redis,originals,backups,monitor,soak}
   sudo chown 1001 /mnt/ssd/mizano/originals && sudo chmod 700 /mnt/ssd/mizano/originals  # api/worker run as uid 1001
   ```

   Every bind mount uses `create_host_path: false`, and `stack.sh up`/`deploy.sh` refuse to run when `MIZANO_DATA_DIR` is missing or sits on the SD card (`/dev/mmcblk*`). If the SSD fails to mount, the stack stays down instead of writing a fresh database to the SD card.

5. Move Docker's own storage (images, container logs) to the SSD and cap its logs:

   ```bash
   sudo systemctl stop docker docker.socket
   sudo rsync -aHAX /var/lib/docker/ /mnt/ssd/docker/
   sudo cp deploy/pi/docker-daemon.json /etc/docker/daemon.json
   sudo mkdir -p /etc/systemd/system/docker.service.d
   sudo cp deploy/pi/systemd/docker.service.d/10-mizano-ssd.conf /etc/systemd/system/docker.service.d/
   sudo systemctl daemon-reload && sudo systemctl start docker
   docker info --format '{{.DockerRootDir}}'   # /mnt/ssd/docker
   ```

6. Cap the host journal and keep swap off the SD card. The compose limits leave about 2.5G of headroom, so swap is only a last-resort buffer for the host:

   ```bash
   sudo mkdir -p /etc/systemd/journald.conf.d
   sudo cp deploy/pi/journald-mizano.conf /etc/systemd/journald.conf.d/mizano.conf
   sudo systemctl restart systemd-journald
   # Raspberry Pi OS: disable the SD-card swap file; zram swap (if enabled by the OS) can stay
   sudo dphys-swapfile swapoff && sudo systemctl disable dphys-swapfile || true
   echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-mizano.conf && sudo sysctl --system
   ```

7. Use an official Pi power supply and active cooling; the health check alerts on undervoltage and throttling.

## 2. Get the deploy files (no source build on the Pi)

```bash
sudo git clone --depth 1 --filter=blob:none --sparse https://github.com/AbdelrhmanAh7/mizano /opt/mizano
cd /opt/mizano && sudo git sparse-checkout set deploy/pi scripts
cp deploy/pi/.env.pi.example deploy/pi/.env.pi && chmod 600 deploy/pi/.env.pi
```

Fill `.env.pi` (generate secrets with `openssl rand -base64 48`). It is gitignored; never commit it. Validate it with `deploy/pi/scripts/stack.sh check`, which runs the same rules as `APP_ENV=pi pnpm env:check`. It uses the host's `node` if there is one, otherwise a throwaway `node:20-alpine` container with no network. It names every missing or placeholder key, weak or reused secret, unpinned image, non-https origin and `DATABASE_URL`/Postgres mismatch, and prints key names only. Before the first deploy, the two image keys still hold the template digest and are the only expected errors; `deploy.sh` pins them.

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
- `OLLAMA_ENABLED=false`; no paid cloud AI.

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

## 5. Start, stop and reboot

```bash
deploy/pi/scripts/stack.sh check     # validate .env.pi
deploy/pi/scripts/stack.sh up        # env check + SSD check, start, wait until api/worker/web are healthy
deploy/pi/scripts/stack.sh status    # containers (stopped ones too), health, docker stats, free -m
deploy/pi/scripts/stack.sh logs api  # follow one service (logs are capped at 3 x 10 MB per container)
deploy/pi/scripts/stack.sh down      # stop and remove containers; data on the SSD is kept
```

Start order comes from health checks: postgres (`pg_isready` over TCP) and redis, then the one-shot `migrate`, then api and worker, then web (once the api is healthy), then cloudflared (once the web is healthy). Every long-running service has `restart: unless-stopped`. The api probe is `GET /api/health/ready`, which answers 503 until Postgres answers a query and Redis answers a `PING` on the api's own Redis client (the cache store is in-process memory, so it is never used as the Redis check), and the web probe is the web app's `GET /api/health`, which answers 503 while that api readiness route fails; `/api/health` on the api itself is always 200 and only carries the status in its JSON, so no probe uses it. `stack.sh up` reports `stack healthy` only when api, worker and web are `healthy` and the `cloudflared` container is `running`: the tunnel has no health check (the image is a bare binary), but a bad token or a crash loop leaves it `restarting`/`exited`, and nothing is reachable without it because no ports are published.

Recover automatically after a reboot or power cut:

```bash
sudo cp deploy/pi/systemd/mizano-stack.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable mizano-stack.service
```

The unit waits for the SSD mount (`RequiresMountsFor=/mnt/ssd/mizano`) and Docker, then runs `stack.sh up`. On shutdown it runs `stack.sh stop`, giving Postgres 60 s for a clean stop. If `stack.sh up` fails (for example the health wait times out while Postgres is still recovering), systemd reruns it after 30 s, at most 5 starts per hour (`Restart=on-failure`, `StartLimitBurst=5`); a retry reuses the containers that are already running. After the fifth failure the unit stays `failed` and `mizano-healthcheck.timer` alerts; fix the cause, then `sudo systemctl reset-failed mizano-stack && sudo systemctl start mizano-stack`. Reboot test: `sudo reboot`, then without touching anything run `stack.sh status` and confirm every service is `healthy` and `systemctl is-active mizano-stack` prints `active`. Record the time from boot to healthy.

## 6. Backups and restore drill

```bash
sudo cp deploy/pi/systemd/*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mizano-backup.timer mizano-healthcheck.timer
```

The units assume the repo at `/opt/mizano`; edit `ExecStart` otherwise, and ensure the user running them can use Docker (they run as root by default).

- Generate a key pair on your own machine: `age-keygen -o mizano-backup.key`. Put only the public key in `BACKUP_AGE_RECIPIENT`. Store the private key offline (password manager); the Pi must not hold it.
- `backup.sh` runs nightly at 02:30 Africa/Cairo: encrypted `pg_dump` (custom format) and a tar of `originals/` in `$MIZANO_DATA_DIR/backups`, retention `BACKUP_RETENTION_DAYS`, status in `backup.status`. Copy the folder off the Pi as well (a backup on the same SSD is not a disaster backup).
- Run a drill monthly and before every demo: `AGE_IDENTITY_FILE=/path/mizano-backup.key deploy/pi/scripts/restore-drill.sh`. It restores the latest dump into a scratch Postgres container, then checks that tables exist and journal debits equal credits.

## 7. Monitoring

`mizano-healthcheck.timer` runs `healthcheck.sh` every 5 minutes: api readiness (`/api/health/ready`, 503 while Postgres or Redis is down), web readiness (`/api/health`, 503 while the api readiness route fails), worker container health (heartbeat), any new OOM kill (kernel `oom_kill` counter), disk above 80%, low available memory, CPU temperature, throttling (`vcgencmd get_throttled`), and backup status older than 26 hours. Alerts and recovery messages go to Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`). Messages contain only short check names; no secrets or document data. A state file in `$MIZANO_DATA_DIR/monitor` suppresses repeats. The script checks the SSD mount before writing anything: with `MIZANO_DATA_DIR` missing or on the SD card it sends an alert on every run (there is no state file to dedupe with) and exits. Create the bot with BotFather and get the chat id from `getUpdates`.

## 8. 24-hour soak test (acceptance evidence)

The acceptance for #39 is 24 h under the demo workload with no OOM kills and no swap thrash, plus automatic recovery after a reboot.

```bash
sudo cp deploy/pi/systemd/mizano-soak.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl start mizano-soak.timer    # one sample per minute
# ... run the demo workload (acceptance contract journeys, intake uploads, reports) for 24 h ...
deploy/pi/scripts/soak-report.sh                                          # summary + verdict
sudo systemctl stop mizano-soak.timer
```

`soak-sample.sh` appends to `$MIZANO_DATA_DIR/soak/`: `samples.tsv` (host MemAvailable, swap used, `pswpin`/`pswpout`, `oom_kill`; per service cgroup `memory.current`/`memory.peak`/`memory.max`, cgroup OOM kills, restart count, health) and `stats.log` (raw `free -m` and `docker stats` output). Every long-running service (`STACK_SERVICES` in `lib.sh`: postgres, redis, api, worker, web, cloudflared) gets one row per minute whether or not its container exists, with `missing`, `exited` or `restarting` as its health, so a service that disappears cannot drop out of the report. It records resource numbers and container names only.

`soak-report.sh` prints the window, minimum MemAvailable, swap traffic, the OOM-kill delta and, per service, peak memory against its limit, restarts, samples in which it was not healthy and samples in which it had no row. Its verdict is `FAIL` on any OOM kill, container restart, any sample in which a service is not `healthy` (unhealthy, still starting, stopped or missing) or any sample in which a service has no row; `SWAP-THRASH` when average swap-in exceeds `SWAP_IN_MAX_PER_SEC` (default 10 pages/s); `INCOMPLETE` under `SOAK_HOURS` (default 24), with fewer than 90% of the one-per-minute samples, or when a running service has a sample whose cgroup memory fields are `na` (the sampler found no cgroup directory or could not read `memory.current`/`memory.peak`/`memory.max`/`memory.events`; 0 MB with no OOM counter is missing evidence, not a healthy budget, and the `unread` column shows how many samples are affected); and `PASS` otherwise. Start the timer only after `stack.sh up` reports healthy: a sample taken while a service is still starting fails the soak. Do the reboot test (section 5) after the soak, because a reboot resets the kernel counters. Attach the report output and the first, middle and last `stats.log` blocks to the issue. Without that evidence the acceptance stays unverified.

## 9. Upgrade and rollback

- Upgrade: run `deploy.sh` with the new SHA and digests (section 4). The worker runs the api image, so it is upgraded and rolled back together with the api.
- Manual rollback: `deploy/pi/scripts/rollback.sh` restores the previous `OK` digests from `deployments.log`.
- Back up before any upgrade that includes a migration: `sudo systemctl start mizano-backup.service`.
