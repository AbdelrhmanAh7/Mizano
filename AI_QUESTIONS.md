## AI Questions for Issue #104

This document tracks decisions, schema sign-off, and follow-up items for Issue #104 (PR #123).

### 1. Follow-up issue: Mirror host token rotation dates to non-Pi stacks (.env.local, .env.dev, .env.sit)

The brief specifies:

> "Add the keys to `deploy/pi/.env.pi.example` and to the `api` service `environment:` list in `deploy/pi/docker-compose.pi.yml`... Mirror the keys in root `.env.local`, `.env.dev` and `.env.sit` for the non-Pi stacks."

**CTO Directive & Conflict Resolution:**
During PR #123 review, the CTO issued a binding block rule decision (`<!-- nql-cto decision=blocked-hard-rule head=32c8f6779677aff19b8125a4a8b160070e2a8cf6 item=pr:AbdelrhmanAh7/Mizano#123 -->`):

> "Deterministic check flags changes to secret-bearing env files .env.dev, .env.local and .env.sit under the credentials rule.. Nothing waits on the founder: the safe part continues and this item is listed in the CTO's daily digest.
> Safe part: Everything except the three root .env files: the classifier, boot service, SMTP stamp, migration, Pi example and compose keys, tests, and the warn-level fix. A follow-up issue can track the non-Pi .env mirrors for founder handling.
> Engineers do now:
>
> 1. Revert the changes to .env.dev, .env.local and .env.sit in this PR. Keep deploy/pi/.env.pi.example and docker-compose.pi.yml unchanged.
>    ...
> 2. Remove the root .env mirroring claim from EVIDENCE.md and the PR body. Note that the non-Pi stacks fall back to unknown until the keys are added."

**Action / Follow-up:**
Because automated implementers are strictly forbidden from modifying secret-bearing files, this gap is tracked for manual founder/operator application via the following follow-up issue:

```bash
gh issue create --title "ops: mirror host token credential rotation dates to non-Pi root .env files" --label "ops,p2" \
  --body "Parent: #104 (PR #123). PR #123 added credential age checking for TELEGRAM_BOT_TOKEN and CLOUDFLARE_TUNNEL_TOKEN. The Pi stack carries the keys in deploy/pi/.env.pi.example and deploy/pi/docker-compose.pi.yml. Under the CTO credentials rule (PR #123 comment), secret-bearing root env files (.env.local, .env.dev, .env.sit) cannot be modified by automated agents. Founder/operator to add TELEGRAM_BOT_TOKEN_CREDENTIAL_ROTATED_AT and CLOUDFLARE_TUNNEL_TOKEN_CREDENTIAL_ROTATED_AT placeholders to root .env.* files so non-Pi stacks report 'ok' instead of 'unknown'."
```

Until the keys are populated in the non-Pi `.env` files, non-Pi environments safely report host tokens as `unknown` on boot without crashing or blocking application startup.

### 2. Coordinator sign-off: Organization.smtpPasswordRotatedAt schema change

Issue #104 requires:

> "Per-organization SMTP password: add `Organization.smtpPasswordRotatedAt`, set server-side whenever `smtpPassword` changes through `PATCH /organization/settings/email` (never client-supplied), and classify it per organization. Schema change: request it from the coordinator first."

- **Schema modification:** Migration `20261008000100_smtp_password_rotated_at` adds nullable column `smtpPasswordRotatedAt TIMESTAMP(3)` to table `organizations`.
- **Coordinator sign-off request:** PR #123 serves as the formal request for coordinator sign-off on this schema migration.
- **Boot resilience:** If the API starts before the migration is applied (e.g. during GCP deployment where API starts before `prisma migrate deploy`), `CredentialAgeCheckService.classifySmtpPasswords` catches the Prisma query error, logs an error without secrets, and gracefully returns `SMTP_PASSWORD=unknown` so boot logging completes successfully without unhandled rejections.

### 3. Test suite line budget (open: no sign-off)

The issue says "under ~300 changed lines". Exact numbers on `f2aca0cc` (`git diff --numstat origin/master...HEAD`, excluding the two docs files and `migration.sql`): 159 lines of production and config, 444 lines of tests, 603 in total.

- Tests: `credential-age-check.service.spec.ts` 93, `credential-age.spec.ts` 60, `organizations.service.spec.ts` 21, `credential-rotation.e2e-spec.ts` 205 (2 tests), `e2e-army/104-smtp-rotation-stamp.e2e.ts` 65.
- The target of about 330 lines is not met. Reaching it means deleting `credential-rotation.e2e-spec.ts`, which is the only test of the stamp and the boot line against a real database. No agent can sign off the overrun; the owner or CTO decides whether to accept it or to delete that file.

# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.
