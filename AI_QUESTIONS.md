# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

# Questions / follow-ups for #206 (inventory costing service spec)

## Cost-layer idempotency backed by unique index

`CostingService.addCostLayer` returns the existing layer when the same
`referenceType` + `referenceId` arrives again for one organization, item and
warehouse (AC3). Sequential retries are caught via `findFirst` and concurrent retries
via `inventory_cost_layers_source_event_key` catching `P2002` (implemented in the base PR
via migration `20261019124000_inventory_cost_layer_unique_source_event`).

Not reachable today: nothing in `apps/api/src` calls `addCostLayer` or
`consumeFIFO`. Only `getInventoryValuation` is wired, through
`GET /items/valuation` and `GET /items/:id/valuation`.

## AC1 / AC3 wording: this service posts no journal

`costing.service.ts` writes only `inventoryCostLayer` rows and posts no journal.
AC1 is checked as exact `Decimal` COGS and valuation amounts, and AC3 as "one
cost layer per source event". There are no journal lines to balance here; the
COGS journal belongs to whichever caller posts it, and none exists yet.

## Behaviour kept as is: insufficient stock

`consumeFIFO` with more quantity than the layers hold consumes every layer and
returns the cost of the stock that existed. It does not throw, and the missing
units carry zero cost. The spec pins this behaviour. Whether it should reject
the request or warn is a product decision.
