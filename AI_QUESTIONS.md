# AI_QUESTIONS — #41

## 1. The acceptance criteria need a run on the Raspberry Pi (owner action)

Both acceptance criteria ("a deploy and a rollback performed on the Pi with evidence" and "a restore drill from the previous night's backup succeeds, with timings") need the physical Pi 5, published arm64 image digests (#38), `.env.pi` secrets and the age private key. The implementer has none of these and must not touch secrets, so this branch delivers the scripts and offline tests only; `EVIDENCE.md` marks AC-1 and AC-2 **NOT VERIFIED**.

To close #41, on the Pi (runbook #44, `deploy/pi/README.md` section 8):

1. `deploy/pi/scripts/deploy.sh <sha-A> sha256:<api-A> sha256:<web-A>`, then the same for a second tested SHA B.
2. `deploy/pi/scripts/rollback.sh` (returns to A).
3. Paste the three entries from `$MIZANO_DATA_DIR/deploy-evidence.log` into the issue.
4. Set `BACKUP_REMOTE`, let the 02:30 timer run, then the next day:
   `AGE_IDENTITY_FILE=/path/mizano-backup.key deploy/pi/scripts/restore-drill.sh`
   and paste the `backups/drill.log` line (timings) and `backup.status` (`offsite=ok`).

Question: should a later issue add a CI job that builds the images and calls `deploy.sh` over SSH, or does the operator deploy by hand for the demo?

## 2. CI suggestion (not changed: CI is owner-only)

The new offline tests are not part of `pnpm ci:full`. Suggested CI step:

```bash
bash deploy/pi/scripts/test/restore-drill.test.sh
node --test deploy/pi/scripts/test/
shellcheck deploy/pi/scripts/*.sh deploy/pi/scripts/test/*.sh
```

`shellcheck` was not available on the implementer's machine; please run it once before merge.
