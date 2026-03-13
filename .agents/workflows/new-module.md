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
   ├── {module-name}.controller.ts
   ├── {module-name}.service.ts
   ├── dto/
   │   ├── create-{entity}.dto.ts
   │   └── update-{entity}.dto.ts
   └── tests/
       └── {module-name}.service.spec.ts
   ```

3. Follow these conventions for each file:

### Module File

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { {Name}Controller } from './{name}.controller';
import { {Name}Service } from './{name}.service';

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
@Controller('{resource}')
@UseGuards(JwtAuthGuard, OrganizationGuard)
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
- Use `Decimal` for monetary values
- Financial records: soft delete with `deletedAt`

4. Add the Prisma model to `apps/api/prisma/schema.prisma` following conventions:
   - `id String @id @default(cuid())`
   - `organizationId String`
   - `createdAt DateTime @default(now())`
   - `updatedAt DateTime @updatedAt`
   - `@@index([organizationId, createdAt])`

5. Register the module in `apps/api/src/app.module.ts`

6. Generate Prisma client:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:generate
```

7. Push schema changes:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm db:push
```

8. Run lint and type-check to verify:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm --filter api lint && pnpm type-check
```
