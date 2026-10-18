# Follow-ups for #212 (not in this slice)

- #162 item 3: make the stock moves in `issue` / `markReturned` atomic with the status change.
- #143: lower the heap cap in `.env.example`, fix the `.env.local` load order, route the production CMD through the launcher, align `nodeHeapMbSchema`/`parseHeapMb` with the launcher, re-run EVIDENCE for the merged head.
- #107: re-check `.husky/pre-push` CodeRabbit findings against master; fix the `docs/DEVELOPMENT.md` Minor.
- QA-checklist review of #149, #152, #154.
- Pre-existing `tsc` errors in `apps/api/src/modules/logger/logger.service.ts` (~line 309).
