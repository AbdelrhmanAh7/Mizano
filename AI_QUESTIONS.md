## AI Questions for Issue #97

Slice 1 of #97 (this PR) is documentation only. The decisions below belong to the owner; each one has a default the next implementer can take if no answer arrives.

### 1. No ETA/VAT notification client exists yet

`apps/api/src` has no ETA (Egyptian Tax Authority) or VAT notification client and no outbound invoice-notify sender (`grep -rliw eta apps/api/src` and `grep -rn "ETA_\|invoice-notify" apps/api/src` both return nothing). Following the plan ("if there is no ETA integration, this PR is only the doc plus AI_QUESTIONS.md"), the `credential-age` check was not written. Config is loaded once by `ConfigModule.forRoot` in `apps/api/src/app.module.ts` (`.env.${APP_ENV}` then `.env`, in `apps/api/` and the repo root); the future check must read through that `ConfigService`, not a second loader.

**Question:** Should slice 2 wait for the first real integration token (ETA submission, invoice e-mail/SMS relay), or ship the age check now for the tokens the Pi already holds (`TELEGRAM_BOT_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`)?
_Default:_ ship it for the existing tokens and add the ETA/VAT names when that client lands.

### 2. Slice 2: vault choice and where the rotation metadata lives

- **Vault choice.** Which backend stores the integration secrets?
  _Default:_ no vault on the Pi for the demo. Secrets stay in `deploy/pi/.env.pi` (`chmod 600`, never committed, loaded by `deploy/pi/scripts/lib.sh` without echoing) and are rotated by hand. Revisit a vault (HashiCorp Vault, or `age`-encrypted files, which the Pi already uses for backups) only when a second host or operator appears.
- **Metadata location.** The Pi deployment checks out only `deploy/pi` (sparse clone, README section 2), reads `deploy/pi/.env.pi`, and `deploy/pi/docker-compose.pi.yml` passes an explicit `environment:` list to the `api` container. The root `.env.prod` never reaches the Pi, and a key that exists only in `.env.pi` is not visible inside the container either.
  _Default:_ the rotation date lives in `deploy/pi/.env.pi` as `<NAME>_CREDENTIAL_ROTATED_AT=YYYY-MM-DD` (date only, never the secret), documented in `deploy/pi/.env.pi.example`, and is wired into the `api` service in `deploy/pi/docker-compose.pi.yml` as one line per credential, for example `ETA_CREDENTIAL_ROTATED_AT: ${ETA_CREDENTIAL_ROTATED_AT:-}`. The root `.env.local`, `.env.dev` and `.env.sit` carry the same key for the non-Pi stacks. If a vault is adopted later, the vault's own metadata becomes the source and the env key is dropped.

### 3. Slice 3: anomaly alerts on outbound invoice-notify volume

There is no outbound notify sender yet (item 1), so slice 3 stays blocked until one exists. The rule below is the proposed default once it does.

- **Metric.** Count send _attempts_ per organization per UTC day, successes and failures alike. A retry loop is exactly the anomaly to catch.
- **Rule.** Alert when today's count exceeds `max(FLOOR, 2 × baseline)`, where `baseline` is the mean daily count over the last 30 full UTC days.
- **Absolute floor.** `FLOOR = 50` attempts per day per organization, configurable as `NOTIFY_ANOMALY_MIN_DAILY`. The floor is always nonzero, so a legitimate zero-volume baseline (new organization, quiet month) never turns the first ordinary notification into an alert.
- **Warm-up.** Until 7 full UTC days of history exist, only the floor applies and the ratio part is off. From day 8 to day 30 the baseline uses the full days available. Counts persist under `$MIZANO_DATA_DIR`, so a restart does not reset the warm-up.
- **Delivery.** Same channel and dedupe as `deploy/pi/scripts/healthcheck.sh`: one Telegram alert keyed `notify-volume` when the check starts failing, one recovery message when it clears. The message carries the count and the threshold, never invoice data.

**Question:** Is 50 attempts per day the right floor for the demo tenant, and should an alert also pause sending (circuit breaker) or only notify?
_Default:_ 50 per day, notify only. Nothing stops the accountant's flow automatically.
