# Questions / follow-ups for #207 (currency service spec)

1. **AC1 and AC3 assume a posting path that `currency.service.ts` does not have.** No method writes a
   journal. `calculateUnrealizedGainLoss` is a read-only report: it reads open invoices and bills and
   returns figures. So "exact journal lines per posting path" and "posting twice creates one journal"
   have nothing to test. The spec checks what holds instead: exact gain/loss figures per document, a
   total equal to the sum of its parts, no journal/journalLine/invoice/bill write and no `$transaction`,
   and identical results on a rerun. If the owner wants period-end unrealised FX revaluation posted
   (gain/loss account vs AR/AP control, auto-reversed next period, idempotent per org+period), that is
   a new feature for R&D. This spec issue does not cover it.
2. **Money is JS `number` in this service.** `getRate`, `convertAmount`, `convertToBaseCurrency` and
   `calculateGainLoss` `parseFloat` the stored `Decimal` and multiply floats, which goes against the "Decimal
   for money" rule. The spec pins the current 4-dp half-up results. Moving these to `Decimal` changes
   the API response types, so it needs its own issue.
3. `getRate` / `createExchangeRate` use `setHours(...)`, which runs in server local time. Rate-date cut-offs
   therefore depend on the container TZ. The spec avoids TZ-dependent assertions.
4. Redis: this service uses no cache, so only Prisma is mocked (`test/mocks/prisma.mock.ts`).

# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.
