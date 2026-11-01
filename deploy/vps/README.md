# Jarda on your own cloud server

One Ubuntu 24.04 server at any cloud runs the whole Jarda stack: web app, API, document worker,
Postgres, Redis and Caddy (automatic HTTPS). Nothing in the kit depends on the provider: it needs
Ubuntu 24.04, a public IP, SSH key login and ports 22/80/443. This guide covers **AWS Lightsail
first**; Contabo and Hetzner are listed as alternatives.

What `install.sh` does, in one command:

- updates Ubuntu, turns on automatic security updates, adds swap if there is none;
- **SSH keys only**: password login off, a sudo user `jarda` with your key, root by key only;
- **firewall** (ufw): only 22, 80 and 443 open;
- installs **Docker** from Docker's own repository, with **log rotation** (10 MB × 5 per container,
  journal capped at 500 MB);
- builds the images for your domain and starts the stack; **Caddy** gets free Let's Encrypt
  certificates for `jarda.<domain>` (the app) and `jarda-api.<domain>` (the API);
- **restart on reboot** (`jarda-stack.service`, containers `restart: unless-stopped`);
- **nightly encrypted backup** at 02:30 Cairo (`pg_dump` + uploaded documents, restic, kept
  7 days on the server) and an **upload to Cloudflare R2**, off until you add the R2 keys;
- a health check every 5 minutes (Telegram alerts if you set a bot).

Running it again updates Jarda to the latest `master`: it backs up first, keeps every secret and
all data, rebuilds and restarts (about a minute of downtime).

Why two hostnames: the web app's sign-in (NextAuth) and the API both live under `/api/auth/*`, so
they cannot share one address. `jarda-api.<domain>` is one level deep on purpose, so Cloudflare's
free certificate also covers it if you ever turn the orange proxy on.

## 1. Pick a server

Jarda needs about 4 GB of memory to run and 6–8 GB while it builds a new version. Prices checked
1 Nov 2026, excluding VAT.

| Provider | Plan | Size | Price | Notes |
| --- | --- | --- | --- | --- |
| **AWS Lightsail** (recommended) | Linux, 8 GB | 2 vCPU, 8 GB, 160 GB SSD, 5 TB transfer | **$44 / month** (IPv4 included) | Region Frankfurt (`eu-central-1`) is closest to Egypt and the Gulf among Lightsail regions. [Pricing](https://aws.amazon.com/lightsail/pricing/) |
| AWS Lightsail, both products | Linux, 16 GB | 4 vCPU, 16 GB, 320 GB SSD | $84 / month | When FlowLine production runs on the same server (section 9). |
| Contabo | Cloud VPS 20 | 6 vCPU, 12 GB | ≈ €6.00 / month first term, then €7.50 | Cheapest; weaker support and network. [Pricing](https://contabo.com/en/vps/) |
| Hetzner | Cloud CPX32 | 4 vCPU, 8 GB, 160 GB | ≈ €35.49 / month | Better network than Contabo. [Pricing](https://www.hetzner.com/cloud/) |

Smaller than 8 GB works for running but the on-server build may run out of memory; the script adds
4 GB of swap to help.

## 2. Create the server

### AWS Lightsail

1. Lightsail console → **Create instance** → region **Frankfurt** → platform **Linux/Unix** →
   blueprint **OS Only → Ubuntu 24.04 LTS**.
2. **SSH key**: upload your own public key (or Claude's, from the session that will install). Don't
   rely on the browser-only key.
3. Plan: **$44 (8 GB)** → name it `jarda` → Create.
4. **Networking** tab → **Create static IP** and attach it (free while attached). Without it the
   address changes when the instance stops.
5. **Networking** tab → **IPv4 firewall**: keep SSH (22) and HTTP (80), **add HTTPS (443)**. Do the
   same under IPv6. Lightsail's firewall sits in front of the server; ufw on the server is a second
   layer.
6. Optional: **Snapshots → Enable automatic snapshots** (a whole-disk copy per day, billed per GB).
   The nightly backup below is the one to restore from; snapshots are an extra safety net.

You log in as `ubuntu`: `ssh ubuntu@<static-ip>`.

### Contabo or Hetzner

Order Ubuntu 24.04 with your SSH key added in the order form (Hetzner: "SSH keys"; Contabo: "SSH
key" under Login). Log in as `root`. Hetzner's optional Cloud Firewall should allow 22/80/443.

## 3. Point the domain at the server

At your DNS provider (Cloudflare recommended) add two **A** records to the server's IP:

| Name | Type | Value | Cloudflare proxy |
| --- | --- | --- | --- |
| `jarda` | A | `<server-ip>` | **DNS only** (grey cloud) |
| `jarda-api` | A | `<server-ip>` | **DNS only** (grey cloud) |

Keep the proxy off: Caddy then gets its own certificates, and the API sees each visitor's real
address for sign-in throttling. Wait until `dig +short jarda.<domain>` shows the IP.

## 4. Install

```bash
ssh ubuntu@<server-ip>        # or root@<server-ip> on Contabo/Hetzner
curl -fsSL https://raw.githubusercontent.com/AbdelrhmanAh7/Mizano/master/deploy/vps/install.sh \
  | sudo bash -s -- --domain <domain> --email <you@domain>
```

The first run takes 10–20 minutes (most of it is the image build). It ends with the app address and
a notice to **copy the backup password** (`sudo cat /etc/jarda/restic-password`) into your password
manager. Without that password no backup can be read, including the copy in R2.

Check from your computer: `https://jarda.<domain>` opens the sign-in page and
`https://jarda-api.<domain>/api/health` answers `ok`. Open ports from outside:
`nmap -Pn -p 22,80,443,5001,6001,5432,6379 <server-ip>` shows only 22, 80 and 443.

Files on the server:

| Path | What |
| --- | --- |
| `/opt/jarda` | the code (a git checkout; the install updates it) |
| `/etc/jarda/jarda.env` | settings and generated secrets (mode 600; never share) |
| `/etc/jarda/restic-password` | backup password (mode 600; keep a copy in your password manager) |
| `/etc/jarda/r2.env` | off-site backup settings (Cloudflare R2), off by default |
| `/srv/jarda/` | database, uploaded documents, Redis, certificates, local backups |
| `/var/log/jarda-build.log` | the last image build |

## 5. Email (optional)

Password reset links and invoices sent to customers need an email service. With Resend's free plan
(3,000 emails a month, 100 a day; resend.com/pricing, 1 Nov 2026), verify your domain there, then add to `/etc/jarda/jarda.env`:

```bash
MAIL_SMTP_HOST=smtp.resend.com
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=resend
MAIL_SMTP_PASSWORD=<Resend API key>
MAIL_FROM="Jarda <no-reply@<domain>>"   # keep the quotes
```

and run `sudo systemctl restart jarda-stack`.

## 6. Backups

- **Nightly** at 02:30 Cairo (`jarda-backup.timer`): one encrypted restic snapshot with a consistent
  `pg_dump` (custom format), every uploaded document and a checksum manifest. Kept **7 days** in
  `/srv/jarda/backups/restic`. Status: `/srv/jarda/backups/backup.status`.
- **Off-site copy to Cloudflare R2** (free tier 10 GB): create a bucket `jarda-backups`, an R2 API
  token with Object Read & Write on that bucket only, fill `/etc/jarda/r2.env`, set `R2_ENABLED=1`
  and test with `sudo /opt/jarda/deploy/vps/scripts/backup.sh`. The bucket keeps 30 days
  (`R2_RETENTION_DAYS`). Status: `/srv/jarda/backups/offsite.status`. The R2 keys are read only by
  the backup script, never by the app containers.
- Run a backup by hand: `sudo systemctl start jarda-backup.service`; see the log with
  `journalctl -u jarda-backup -n 50`.
- A local repository on the same disk does not survive the loss of the server: turn R2 on before
  the first paying client.

## 7. Restore

```bash
sudo /opt/jarda/deploy/vps/scripts/restore.sh --list                   # what is there
sudo /opt/jarda/deploy/vps/scripts/restore.sh --yes                    # latest local snapshot
sudo /opt/jarda/deploy/vps/scripts/restore.sh --snapshot <id> --yes    # a given one
```

It verifies the snapshot's checksums, takes a **safety backup** of the current data, stops the app,
replaces the database and the documents folder (the old folder is kept as
`originals.before-restore-<time>`), checks per-organization record counts, ledger balance and
document links against the snapshot, and starts the app again. If a check fails the app stays
stopped and nothing is deleted.

**New server after losing the old one:** install as in section 4 with the same domain, copy the
old `/etc/jarda/restic-password` and `/etc/jarda/r2.env`, set `BACKUP_HOST=jarda-vps` (the default)
and the old `INTEGRATIONS_ENCRYPTION_KEY` in `/etc/jarda/jarda.env` (it opens the AI and connection
keys organizations saved; keep it in the password manager too), then:

```bash
sudo /opt/jarda/deploy/vps/scripts/restore.sh --from-r2 --skip-safety-backup --yes
```

A full disaster drill (sign-up over HTTPS, synthetic ledger with documents, backup to an S3
stand-in for R2, total loss, restore from the bucket, same counts and the same user signs in) is
`deploy/vps/scripts/test-vps-drill.sh`. Run it on a spare machine or a throwaway server, never on
the production server (it uses the same network range) and not on the owner's laptop (memory).
Evidence of the backup and restore on the real server goes in `docs/evidence/vps-kit/`.

## 8. Everyday commands

```bash
sudo /opt/jarda/deploy/vps/scripts/compose.sh ps                      # every container
sudo /opt/jarda/deploy/vps/scripts/compose.sh logs --tail 100 api
sudo systemctl restart jarda-stack          # restart everything (Jarda and compose.d)
sudo /opt/jarda/deploy/vps/scripts/healthcheck.sh
```

Update to a new version: run the install command from section 4 again. To deploy a tag instead of
`master`, add `--ref <tag>`.

## 9. Other products on the same server (FlowLine)

The server is shared: Caddy is the only door (80/443) and every product sits on the same internal
Docker network. A product plugs in with three files, without changing this kit; `install.sh`
creates the folders and keeps their contents on every update.

| Slot | Picked up by | Example |
| --- | --- | --- |
| `/etc/jarda/compose.d/<name>.yml` | `scripts/compose.sh` and `jarda-stack.service` (same project, network `internal`) | [examples/flowline.compose.yml](examples/flowline.compose.yml) |
| `/etc/jarda/caddy-sites/<name>.caddy` | Caddy (`import /etc/caddy/sites/*.caddy`); HTTPS certificate on its own | [examples/flowline.caddy](examples/flowline.caddy) |
| `/etc/jarda/backup.d/<NN-name>` (executable) | the nightly `backup.sh`, after Jarda's snapshot, before the R2 copy | [examples/flowline.backup.sh](examples/flowline.backup.sh) |

Rules: publish no ports, never redefine a Jarda service name, keep data under `/srv/<name>`,
secrets in `/etc/jarda/<name>.env` (mode 600). After adding or changing a file:
`sudo systemctl restart jarda-stack`. The R2 copy takes every snapshot of this server, so a hook
that backs up into the same restic repository (its own tag) goes off-site too. FlowLine's own
files and steps live in the FlowLine repository (session fl-exit).

## Security notes

- Docker-published ports bypass ufw. Only Caddy publishes ports (80/443); never add `ports:` to
  another service in `docker-compose.vps.yml`.
- Postgres and Redis are on the internal Docker network only. Swagger (`/api/docs`) is off in
  production.
- Secrets are generated on the server (`openssl rand`) and never printed. Save these three in your
  password manager: the backup password, `INTEGRATIONS_ENCRYPTION_KEY`, and the R2 token.
- The admin user has passwordless sudo because it has no password at all (key login only).
