# Jarda / جردة first-client pilot: known issues and limits

Date: 1 November 2026. Scope: the stable pilot defined in [first-client.md](../plans/first-client.md) the acceptance checklist (#598) and the decisions in [DECISIONS.md](../DECISIONS.md). Each line says what a person sees, how severe it is, and what to do. Nothing here is security, wrong money, data loss or an unmet tax duty; anything that is would block the release instead of being listed.

## What the pilot is (and is not)

- Web bookkeeping in Arabic and English for one Egyptian business, books in EGP.
- Tax invoices keep being issued by the client's existing authorized e-invoice issuer; the accountant records that issuer's ETA number or UUID on each invoice and credit note (#585). The app never claims a submission to the tax authority.
- After the first client (closed with the label `later`): Telegram intake and the accountant inbox, Word files, native ETA issuing, Pi speed tests, the FlowLine integration API.

## Known issues (minor, accepted for the pilot)

| #   | What a person sees                                                                                                                                            | Severity                                           | What to do                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The document reader (with AI off) reads the header (vendor, date, totals) but not line items, so every read bill lands in review and a person adds the lines. | Minor (by design for the pilot)                    | Expected; the draft cannot be approved without lines.                                                                                     |
| 2   | Everyone is signed out once after the first deploy of the new sessions (old sign-ins have no session id).                                                     | Minor, one time                                    | Tell the client before the deploy.                                                                                                        |
| 3   | Approved document jobs from before #615 that never got a draft stay "approved" without a draft.                                                               | Minor, old data only                               | Operator checks for such rows before the deploy (see #615).                                                                               |
| 4   | One test run saw "not signed in" instead of "not found" when probing another organization's credit note; the rerun passed.                                    | Minor, test only; nothing was disclosed either way | Seen once in #603's test run; watch for it in the acceptance run (#598).                                                                  |
| 5   | Password-reset emails need a mail account; without one an admin hands over a one-time link (#604).                                                            | Minor                                              | Mail is optional ([next steps](next-business-steps.md) 6).                                                                                |
| 6   | The restore drill ran on test data on a laptop (restore in 4 seconds); a drill on the real server is still to do.                                             | Minor until go-live                                | Operator runs `deploy/pi/scripts/restore-drill.sh` after the first real backup ([record](../evidence/first-client-ops/restore-drill.md)). |
| 7   | The new name Jarda / جردة is not yet checked in trademark registers.                                                                                          | Business risk, not a product defect                | [Next steps](next-business-steps.md) 2; the name lives in one file (`brand.ts`).                                                          |

## Support and recovery

- Product owner and support contact: the founder, named in the pilot scope ([next steps](next-business-steps.md) 1).
- Backups: the backup script is ready (`deploy/pi/scripts/backup.sh`, encrypted with restic, database and originals); the operator still has to schedule it nightly and keep a copy off the server ([next steps](next-business-steps.md) 6 and 8). Proposed targets RPO 24 h, RTO 4 h, to agree with the client.
- A failed database update stops a deploy and the previous version keeps running (#601).
