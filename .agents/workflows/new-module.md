---
description: Scaffold a new NestJS backend module following Mizano conventions
---

# Create New Backend Module

## Steps

1. Ask the user for:
   - **Module name** (e.g., `payments`, `subscriptions`)
   - **Key entities** (e.g., `Payment`, `Subscription`)
   - **Permissions** needed (e.g., `payments.view`, `payments.create`)

2. Create the module directory structure at `apps/api/src/modules/{module-name}/`:

   ```
   {module-name}/
   ├── {module-name}.module.ts
   ├── controllers/{entity}.controller.ts
   ├── services/{entity}.service.ts
   ├── services/{entity}.service.spec.ts
   └── dto/
       ├── create-{entity}.dto.ts
       └── update-{entity}.dto.ts
   ```

   Small single-entity modules may keep `{module-name}.controller.ts` / `{module-name}.service.ts` at the module root.

3. Follow these conventions for each file:

### Module File

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { {Name}Controller } from './controllers/{name}.controller';
import { {Name}Service } from './services/{name}.service';

@Module({
  imports: [PrismaModule],
  controllers: [{Name}Controller],
  providers: [{Name}Service],
  exports: [{Name}Service],
})
export class {Name}Module {}
```

### Controller File

```typescript
// organizationId always comes from the verified JWT via @CurrentOrg()
@ApiTags('{Name}')
@ApiBearerAuth()
@Controller('{resource}')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class {Name}Controller {
  constructor(private readonly {name}Service: {Name}Service) {}

  @Get() @Permissions('{module}.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: ListQueryDto) {}

  @Get(':id') @Permissions('{module}.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {}

  @Post() @Permissions('{module}.create')
  create(@CurrentOrg() orgId: string, @Body() dto: Create{Entity}Dto) {}

  @Patch(':id') @Permissions('{module}.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: Update{Entity}Dto) {}

  @Delete(':id') @Permissions('{module}.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {}
}
```

### Service File

- Inject `PrismaService`
- ALL queries MUST include `organizationId`
- Use `prisma.$transaction()` for multi-table writes
- Use `Decimal` (`DecimalUtils` in `common/utils/decimal.ts`) for money; accept/return decimal strings
- Validate that every referenced ID (account, vendor, bill...) belongs to `organizationId`
- Number documents with `DocumentNumberService`
- Financial records: soft delete with `deletedAt`

4. Request the Prisma model from the schema owner (the coordinator owns `apps/api/prisma/schema.prisma` during the sprint), following conventions:
   - `id String @id @default(cuid())`
   - `organizationId String`
   - `createdAt DateTime @default(now())`
   - `updatedAt DateTime @updatedAt`
   - `@@index([organizationId, createdAt])`
   - money: `Decimal @db.Decimal(19, 4)`; financial records: `deletedAt DateTime?`

5. Register the module in `apps/api/src/app.module.ts`

6. Generate Prisma client:

```bash
pnpm db:generate
```

7. Create a migration against your dedicated local database only:

```bash
pnpm db:migrate
```

8. Run lint and type-check to verify:

```bash
pnpm --filter api lint && pnpm type-check
```
