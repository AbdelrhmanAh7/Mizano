# Next business steps — Jarda / جردة first client

These are not engineering items and do not block the release (owner decision, 1 Nov 2026, see [DECISIONS.md](../DECISIONS.md)). They were the open lines of the Owner checklist (#597).

## Before the first client signs

1. **Pick the client and agree the pilot scope:** business, books in EGP, start month, what is in and out (the pilot is web bookkeeping; see [known-issues.md](known-issues.md)), support contact. Keep the client's details private, never in GitHub.
2. **Name checks for Jarda / جردة:** confirm `mizano.app` (a live Saudi bookkeeping app called ميزانو) is not ours; search "Jarda" and «جردة» in WIPO Global Brand Database / TMview, SAIP (Saudi Arabia), the UAE and Egyptian trademark registers, and social handles, before printing or filing anything. Evidence and caveats: [docs/brand/naming.md](../brand/naming.md). If another name is chosen, change `packages/shared-types/src/brand.ts`.
3. **Domain:** buy the chosen domain (`jarda.sa` and `jarda.app` were free on 1 Nov; `jarda.com` and `jarda.ai` are taken).

## Onboarding the client (first week)

4. **Accountant's ETA confirmation:** the client's accountant confirms in writing (dated) the client's e-invoice / e-receipt obligation and which authorized issuer it keeps using. Jarda lets the accountant record that issuer's ETA number or UUID on each invoice and credit note; it does not submit to the tax authority.
5. **Opening balances:** enter the signed opening trial balance as one opening journal (Accounting → Journals) and check that Jarda's trial balance matches it.

## At go-live (operator)

6. **Production credentials** on the server (never in GitHub): database and storage secrets, `MCP_PUBLIC_URL` only if it differs from the public API address. Keep the restic backup password and the app's encryption key (`INTEGRATIONS_ENCRYPTION_KEY`) in the password manager, off the server. Schedule `backup.sh` nightly and send its copy off the server. Mail (`MAIL_SMTP_*`, `MAIL_FROM`) is optional.
7. **Before the first deploy:** tell the client everyone signs in again once; check for old approved intake jobs without a draft (see #615).
8. **First backup and a restore drill on the real server:** run `deploy/pi/scripts/backup.sh`, then `restore-drill.sh` against that first real backup ([test-data record](../evidence/first-client-ops/restore-drill.md)); agree RPO 24 h / RTO 4 h with the client.
