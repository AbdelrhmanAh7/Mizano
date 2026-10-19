# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

# Follow-up for #254 (customer notes field in CreateCustomerDto / UpdateCustomerDto)

3. `CustomerForm` (`apps/web/components/sales/customer-form.tsx`) includes a UI input for `notes` ("Internal notes about this customer"), and the Prisma `Customer` schema contains a `notes` column. However, `CreateCustomerDto` and `UpdateCustomerDto` in `apps/api/src/modules/sales/dto/` do not define a `notes` field. Because NestJS `ValidationPipe` is configured with `forbidNonWhitelisted: true`, sending `notes` fails with 400 Bad Request.
   In #254, `buildCustomerPayload` drops `notes` from the payload to conform to the API DTO whitelist.
   Follow-up: Should `notes` be added to `CreateCustomerDto` / `UpdateCustomerDto` in a separate API issue so notes entered by users in the UI are persisted?
