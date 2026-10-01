---
description: Build the project for any environment (local, dev, sit, prod)
---

// turbo-all

# Build Project

## Steps

1. Determine the target environment. Ask the user if not specified. Options: `local`, `dev`, `sit`, `prod`.

2. Run Prisma generate to ensure the client is up to date:

```bash
pnpm db:generate
```

3. Build for the specified environment:

```bash
pnpm build
```

For specific environments, use:

- **dev**: `APP_ENV=dev pnpm build` or `pnpm build:dev`
- **sit**: `APP_ENV=sit pnpm build` or `pnpm build:sit`
- **prod**: `APP_ENV=prod pnpm build` or `pnpm build:prod`

4. Verify build output exists:

```bash
ls -la apps/api/dist/
ls -la apps/web/.next/
```

## Environment Files

| Environment | File         | NODE_ENV    |
| ----------- | ------------ | ----------- |
| local       | `.env.local` | development |
| dev         | `.env.dev`   | development |
| sit         | `.env.sit`   | production  |
| prod        | `.env.prod`  | production  |
