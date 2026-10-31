# W06 · Local backup and restore drill

Issue: [#590](https://github.com/AbdelrhmanAh7/Mizano/issues/590). Date: **1 November 2026**, Africa/Cairo.

Tested Code Head: `77b03e9a11aafc264ab4c8754baf2f4623eab230`.
This identifies the exact scripts/fixture commit tested below (the last code commit; later commits,
if any, change this document only). This evidence document was added after the run; no live deployment or Pi/server restore is claimed. Final PR-head checks and
independent review are recorded in the PR.

## Scope and tools

Mac arm64, Docker Engine 29.8.2, PostgreSQL 16,
restic **0.19.1**, ShellCheck **0.11.0**, Python 3 and the repository's Prisma migrations.
The PostgreSQL image used was:

```text
postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c
```

The fixture is synthetic database data, not an accountant-journey or extraction-accuracy test:
2 organizations, 4 immutable originals, 2 balanced posted bill journals and 4 intake → document
links (2 posted bills, 1 unposted draft invoice and 1 invoice voided as a draft, which has no journal). Currency is explicitly EGP and matches
each organization's base currency. No real customer documents or credentials were used.

The source database ran in a unique temporary Compose project on loopback. After the encrypted
backup, the runner **stopped the source database and moved its originals aside**. The restore
used a separate new Postgres container with `--network none`, no published ports and no host
mounts, plus a private temporary originals directory. It accepts no existing target database URL.

The production scripts reuse [pg_dump snapshots](https://www.postgresql.org/docs/16/app-pgdump.html)
and [restic's command input](https://restic.readthedocs.io/en/stable/040_backup.html).
An exported repeatable-read snapshot keeps the custom dump and accounting manifest consistent.
One encrypted restic snapshot contains the dump, originals and manifest; no custom encryption
or storage engine was added.

## Commands and results

All commands below ran through the owner's shared `heavy.sh` queue from the repository root.
The full drill creates and removes its own source database, repository, password file and target.

```bash
bash deploy/pi/scripts/test-backup-restore.sh
shellcheck deploy/pi/scripts/test-restore-drill.sh
bash deploy/pi/scripts/test-restore-drill.sh
```

- Shell syntax and ShellCheck: passed, no findings.
- Offline regressions: **8 passed**. They cover dump/original hash mismatches, tenant-prefixed
  storage keys, archive traversal/symlinks, a real host-tar round trip, count/ledger failures,
  failed-backup status/plaintext-staging cleanup, and a fresh server with no intake folder yet
  (empty backup only when the database lists no originals).
- Real custom-format dump + encrypted restic backup: passed.
- `restic check --read-data`: passed.
- Isolated restore, file hashes and per-organization counts: passed.
- Posted journal and organization trial balance, account tenancy, draft and source-journal links:
  all check counts **zero**.
- Negative check: after the first restore, one approved intake job had its draft link removed and
  a new backup was taken. The restore drill **failed as required** with the fixed reason
  "unbalanced ledger or broken tenant/document/journal links", so an incomplete approval is never
  reported as a recovery.
- Measured restore-script elapsed time: **4 seconds** (Bash `SECONDS`, 1-second resolution),
  including snapshot selection, archive verification, scratch database startup/restore, checks
  and cleanup. This is one small local fixture; it is not a live RTO measurement.

Metadata-only output from the exact-code run:

```text
2026-10-31T23:27:06Z backup OK snapshot=02e20a8d5203e38bd1618762c2ef1172620d8f8d73abb4e341646126c34977d3
fixture organizations=2 originals=4 journals=2 linked_drafts=4 source_database_stopped=1
2026-10-31T23:27:10Z restore stage=verify-files
2026-10-31T23:27:11Z restore stage=database
2026-10-31T23:27:12Z restore stage=verify-ledger-links
organizations=2 originals=4 linked_drafts=4 checks=all-zero
2026-10-31T23:27:12Z restore drill OK snapshot=02e20a8d5203e38bd1618762c2ef1172620d8f8d73abb4e341646126c34977d3 elapsed_seconds=4
incomplete_approval_negative_check=passed
restic_check_read_data=passed source_project_cleanup=passed
```

The 13 counted table groups are accounts, users, customers, vendors, invoices, credit notes,
bills, vendor credits, payments received/made, journals, intake jobs and journal lines.
All source/restored counts are compared inside the private manifest; organization/document identifiers and money
are not printed. Drafts require their document; posted intake documents require their linked
journal. Broken or unverifiable legacy posting links cause a failed drill rather than a guess.

## Cleanup and failure checks

After the run, both commands returned **no container names**:

```bash
docker ps -a --filter name=mizano-drill- --format '{{.Names}}'
docker ps -a --filter name=mizano-restore-drill- --format '{{.Names}}'
```

Source cleanup uses Compose `down -v`. Restore cleanup removes only the container ID returned
by its own create command, with `docker rm -fv` to remove its anonymous data volume. Cleanup
must succeed before the script prints success. Earlier known scratch volumes were identified
from Docker events for this drill's own containers and removed; no general volume prune or
existing database reset was performed. Temporary originals, plaintext dumps, repository and
random fixture passwords were removed. No dev servers were started.

Earlier runs failed on a fixture path/enum mistake and on macOS tar's AppleDouble entries.
These are corrected. The producer now sets `COPYFILE_DISABLE=1`; archive path and checksum
checks were preserved, and a real platform tar regression was added. Raw tool/database errors
are discarded because they may contain document values; logs contain stages, fixed reasons
or exception class names only.

## Recovery inputs and targets

Proposed operator targets: **RPO ≤ 24 hours; RTO ≤ 4 hours**. Nightly scheduling, off-machine
storage and a representative Pi/server drill still require operator setup; they are not proven
by this local test. Redis, the host setup, runtime environment and application sealing keys are
separate recovery inputs. The backup captures source data as it is; a pre-existing unbalanced
ledger or broken link makes restore validation fail.

For this drill, a random restic password lived only in its private temporary file and was
deleted with the disposable repository. **No production restic password/repository was created.**
The operator's runtime password location is `RESTIC_PASSWORD_FILE` (example
`/etc/mizano/restic-password`, absolute, mode 0600/0400, outside Git). Its recoverable master
copy must be in the owner's password manager, alongside off-machine access credentials and
the app sealing key. That production recovery arrangement remains unconfigured/unknown here.
Never commit, print or paste a password into terminal history.

The [runbook](../../../deploy/pi/README.md#5-backups-and-restore-drill) covers one-time restic
initialization, stable host/set labels, retention, server Compose overrides, legacy age backups
and recurring drills. This change does not move production files or deploy the application.
