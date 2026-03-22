---
description: Database operations — generate, push, migrate, seed, reset, studio, validate
---

// turbo-all

# Database Operations

## Steps

Determine which database operation is needed. If the user doesn't specify, ask.

### Generate Prisma Client (after schema changes)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:generate
```

### Push Schema (sync schema to DB without migration)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:push
```

### Create Migration (production-safe schema changes)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:migrate
```

### Seed Database (populate with sample data)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:seed
```

### Reset Database (⚠️ DESTRUCTIVE — drops all data, re-migrates, re-seeds)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:reset
```

### Open Prisma Studio (visual DB browser at :5555)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:studio
```

### Validate Schema

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:check
```

## Common Workflow After Schema Changes

1. Edit `apps/api/prisma/schema.prisma`
2. Run `pnpm db:generate` (updates Prisma Client types)
3. Run `pnpm db:push` (syncs schema to database)
4. Run `pnpm db:seed` if new seed data is needed

## Schema Conventions

- All models: `id String @id @default(cuid())`, `createdAt`, `updatedAt`, `organizationId`
- Money fields: `Decimal @db.Decimal(19, 4)`
- Financial models: add `deletedAt DateTime?` for soft delete
- Indexes: `@@index([organizationId, status])`, `@@index([organizationId, createdAt])`
