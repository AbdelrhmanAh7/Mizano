## AI Questions for Issue #97

Slice 1 of #97 (PR #100) is documentation only. The decisions below belong to the owner; each one has a default the next implementer can take if no answer arrives.

### 0. Tracking: merging PR #100 must not close #97

The implementer harness opens every PR with `Closes #n` (`.github/workflows/ai-implementers.yml`, header comment), so merging PR #100 would close #97 while slices 2 and 3 are still open. The implementer cannot edit the PR body or the workflow (CI changes stop at the owner), so the fix is on the owner's side. Two follow-up issues are drafted below; filing them before the merge keeps the remaining work visible. If #97 is closed by the merge anyway, reopen it or point it at the two issues.

```bash
gh issue create --title "#97 slice 2: credential-age check and rotation metadata" --label ai-ready \
  --body "Parent: #97 (slice 1 merged in #100). Pure function (name, rotatedAtIso, now, maxAgeDays=90) -> ok|due|expired|unknown; strict ISO date, UTC only, malformed = unknown. Read ETA_CREDENTIAL_ROTATED_AT etc. through the existing ConfigService; wire .env.pi + .env.pi.example + docker-compose.pi.yml environment list. Per-organization SMTP password: add smtpPasswordRotatedAt (set server-side when smtpPassword changes) and check it per org. Warn once per boot, names only, never values. Vault decision: see AI_QUESTIONS.md item 2 in #100."
gh issue create --title "#97 slice 3: anomaly alert on outbound invoice e-mail volume" --label ai-ready \
  --body "Parent: #97 (slice 1 merged in #100). Outbound sender exists today: POST /documents/invoice/:id/send -> EmailService.sendInvoice through the organization's SMTP settings; every attempt is already persisted in EmailLog (entityType=invoice, status sent|failed). Count attempts per organization per UTC day from EmailLog; alert when today's count > max(NOTIFY_ANOMALY_MIN_DAILY=50, 2 x 30-day mean); ratio off until 7 full UTC days exist; Telegram alert keyed notify-volume with start/recovery dedupe; notify only, no circuit breaker. Needs an EmailLog index on (organizationId, entityType, sentAt): coordinator-owned schema change."
```

Suggestion for the owner (CI, not changed here): when the Tech Lead plan splits an issue, let the harness write `Refs #n` instead of `Closes #n`.

### 1. Which outbound senders exist today

`apps/api/src` has no ETA (Egyptian Tax Authority) client: `grep -rwi eta apps/api/src` returns nothing, and VAT submission (`POST /vat-returns/:id/submit`, `vat-returns.service.ts`) only posts a local settlement journal and moves the period lock; it never contacts a tax authority. There is, however, a manual outbound invoice e-mail: `POST /documents/invoice/:id/send` (`sales.edit`) calls `EmailService.sendInvoice`, which sends through the organization's own SMTP server (`Organization.smtpHost/smtpPort/smtpUser/smtpPassword`, set via `PATCH /organization/settings/email`) and records every attempt in `EmailLog`. The earlier claim in this file that no outbound invoice sender exists was wrong; it came from grepping the product name (`notify`, `ETA`) instead of the mechanism (`nodemailer`, `sendMail`, `smtp`).

So the credentials in scope today are: `TELEGRAM_BOT_TOKEN` and `CLOUDFLARE_TUNNEL_TOKEN` (host env, `.env.pi`) and each organization's SMTP password (a database column, per tenant). Config for the env tokens is loaded once by `ConfigModule.forRoot` in `apps/api/src/app.module.ts`; the future check must read through that `ConfigService`, not a second loader.

**Question:** Should slice 2 cover the per-organization SMTP password as well as the host tokens, or only the host tokens until an ETA client exists?
_Default:_ cover both. Host tokens through the env metadata below; the SMTP password through a per-organization `smtpPasswordRotatedAt` column that the service sets whenever `smtpPassword` changes (never client-supplied). Add the ETA/VAT names when that client lands.

### 2. Slice 2: vault choice and where the rotation metadata lives

- **Vault choice.** Which backend stores the integration secrets?
  _Default:_ no vault on the Pi for the demo. Host secrets stay in `deploy/pi/.env.pi` (`chmod 600`, never committed, loaded by `deploy/pi/scripts/lib.sh` without echoing) and are rotated by hand. The per-organization SMTP password is a plaintext column in PostgreSQL today; encrypting it at rest (app-level key in `.env.pi`) is a separate decision, out of slice 2. Revisit a vault (HashiCorp Vault, or `age`-encrypted files, which the Pi already uses for backups) only when a second host or operator appears.
- **Metadata location.** The Pi deployment checks out only `deploy/pi` (sparse clone, README section 2), reads `deploy/pi/.env.pi`, and `deploy/pi/docker-compose.pi.yml` passes an explicit `environment:` list to the `api` container. The root `.env.prod` never reaches the Pi, and a key that exists only in `.env.pi` is not visible inside the container either.
  _Default:_ the rotation date lives in `deploy/pi/.env.pi` as `<NAME>_CREDENTIAL_ROTATED_AT=YYYY-MM-DD` (date only, never the secret), documented in `deploy/pi/.env.pi.example`, and is wired into the `api` service in `deploy/pi/docker-compose.pi.yml` as one line per credential, for example `ETA_CREDENTIAL_ROTATED_AT: ${ETA_CREDENTIAL_ROTATED_AT:-}`. The root `.env.local`, `.env.dev` and `.env.sit` carry the same key for the non-Pi stacks. If a vault is adopted later, the vault's own metadata becomes the source and the env key is dropped.

### 3. Slice 3: anomaly alerts on outbound invoice-notify volume

The sender to watch is the invoice e-mail path from item 1. The rule below is the proposed default.

- **Metric.** Count send _attempts_ per organization per UTC day, successes and failures alike, read from `EmailLog` (`entityType = 'invoice'`, `status` `sent` or `failed`, grouped by `organizationId` and the UTC day of `sentAt`). A retry loop is exactly the anomaly to catch, and the log already persists across restarts, so no separate counter store is needed. The query needs an index on `(organizationId, entityType, sentAt)`; that schema change is coordinator-owned.
- **Rule.** Alert when today's count exceeds `max(FLOOR, 2 × baseline)`, where `baseline` is the mean daily count over the last 30 full UTC days.
- **Absolute floor.** `FLOOR = 50` attempts per day per organization, configurable as `NOTIFY_ANOMALY_MIN_DAILY`. The floor is always nonzero, so a legitimate zero-volume baseline (new organization, quiet month) never turns the first ordinary notification into an alert.
- **Warm-up.** Until 7 full UTC days of `EmailLog` history exist for the organization, only the floor applies and the ratio part is off. From day 8 to day 30 the baseline uses the full days available.
- **Delivery.** Same channel and dedupe as `deploy/pi/scripts/healthcheck.sh`: one Telegram alert keyed `notify-volume` when the check starts failing, one recovery message when it clears. The message carries the count and the threshold, never invoice data or recipient addresses.

**Question:** Is 50 attempts per day the right floor for the demo tenant, and should an alert also pause sending (circuit breaker) or only notify?
_Default:_ 50 per day, notify only. Nothing stops the accountant's flow automatically.
