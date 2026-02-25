# Mizano ERP - Backend API Guide

This guide documents the conventions, patterns, and architecture used in the Mizano NestJS backend (`apps/api/`).

---

## Table of Contents

1. [Module Structure](#module-structure)
2. [Controller Pattern](#controller-pattern)
3. [Service Pattern](#service-pattern)
4. [DTO Conventions](#dto-conventions)
5. [Response Format](#response-format)
6. [Authentication Flow](#authentication-flow)
7. [Guards Chain](#guards-chain)
8. [Custom Decorators](#custom-decorators)
9. [Document Number Generation](#document-number-generation)
10. [Pagination Pattern](#pagination-pattern)
11. [Prisma Transactions](#prisma-transactions)
12. [Error Handling](#error-handling)
13. [Soft Delete Pattern](#soft-delete-pattern)
14. [Audit Trail](#audit-trail)

---

## Module Structure

Every business domain follows a consistent directory layout inside `apps/api/src/modules/`:

```
modules/
  sales/
    controllers/
      invoices.controller.ts
      customers.controller.ts
      quotes.controller.ts
      credit-notes.controller.ts
      payments-received.controller.ts
    services/
      invoices.service.ts
      customers.service.ts
      quotes.service.ts
      credit-notes.service.ts
      payments-received.service.ts
    dto/
      create-invoice.dto.ts
      update-invoice.dto.ts
      invoice-query.dto.ts
      create-customer.dto.ts
      ...
    sales.module.ts
```

The module file registers all controllers, services, and imports:

```typescript
// sales.module.ts
@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [
    InvoicesController,
    CustomersController,
    QuotesController,
    CreditNotesController,
    PaymentsReceivedController,
  ],
  providers: [
    InvoicesService,
    CustomersService,
    QuotesService,
    CreditNotesService,
    PaymentsReceivedService,
  ],
  exports: [InvoicesService],
})
export class SalesModule {}
```

Larger domains (sales, purchases) split controllers and services into their own subdirectories. Smaller domains may use a flat structure:

```
modules/
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    dto/
      login.dto.ts
      register.dto.ts
      refresh-token.dto.ts
    guards/
      jwt-refresh.guard.ts
```

---

## Controller Pattern

Controllers use decorators to handle routing, authentication, authorization, and API documentation. Here is the canonical pattern from `InvoicesController`:

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService } from '../services/invoices.service';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Create a new invoice' })
  create(@CurrentOrg() orgId: string, @Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoicesService.create(orgId, createInvoiceDto);
  }

  @Get()
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get all invoices' })
  findAll(@CurrentOrg() orgId: string, @Query() query: InvoiceQueryDto) {
    return this.invoicesService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get invoice by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Update invoice' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(orgId, id, updateInvoiceDto);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @ApiOperation({ summary: 'Delete invoice' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.remove(orgId, id);
  }
}
```

Key conventions:

- `@UseGuards(JwtAuthGuard, PermissionsGuard)` applied at the class level protects all routes.
- `@Permissions('module.action')` on each method specifies required RBAC permissions.
- `@CurrentOrg()` extracts the authenticated user's `organizationId` from the JWT.
- `@ApiTags` and `@ApiOperation` provide Swagger documentation.
- Controllers delegate all logic to services; they never contain business logic.

---

## Service Pattern

Services are `@Injectable()` classes that receive `PrismaService` (and optionally other services) via constructor injection:

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateInvoiceDto) {
    // Validate related entities exist within the organization
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId, deletedAt: null },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    // Business logic (calculations, validations)
    // ...

    // Persist via Prisma
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        organizationId,
        // ... fields using Decimal for money
        subtotal: new Decimal(subtotal),
        grandTotal: new Decimal(grandTotal),
        lines: {
          create: calculatedLines.map((line) => ({
            quantity: new Decimal(line.quantity),
            rate: new Decimal(line.rate),
            amount: new Decimal(line.amount),
          })),
        },
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        lines: { include: { item: { select: { id: true, name: true, sku: true } } } },
      },
    });

    return invoice;
  }
}
```

Key conventions:

- **Every query includes `organizationId`** to enforce multi-tenancy isolation.
- **Monetary values use `Decimal`** from `@prisma/client/runtime/library` -- never JavaScript `number` or `float`.
- Services throw NestJS exceptions (`NotFoundException`, `BadRequestException`, etc.) for error cases.
- Queries for soft-deletable records include `deletedAt: null`.

---

## DTO Conventions

DTOs use `class-validator` decorators for runtime validation and `@nestjs/swagger` decorators for API documentation.

### Create DTO

```typescript
import {
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class InvoiceLineDto {
  @IsString() @IsOptional() itemId?: string;
  @IsString() description: string;
  @IsString() quantity: string;
  @IsString() rate: string;
  @IsString() @IsOptional() discount?: string;
  @IsString() @IsOptional() taxRate?: string;
}

export class CreateInvoiceDto {
  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  quoteId?: string;

  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  terms?: string;
}
```

### Query DTO (extends PaginationDto)

```typescript
import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class InvoiceQueryDto extends PaginationDto {
  @ApiProperty({ required: false, enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
```

### Base PaginationDto

All list endpoints inherit from this common DTO:

```typescript
import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

---

## Response Format

The `TransformInterceptor` automatically wraps all controller return values in a standard envelope.

### Success (single entity)

```json
{
  "data": {
    "id": "clx1abc...",
    "invoiceNumber": "INV-001",
    "status": "DRAFT",
    "grandTotal": "1500.0000",
    ...
  }
}
```

### Success (paginated list)

Services return pre-formatted paginated responses that pass through unchanged:

```json
{
  "data": [
    { "id": "clx1abc...", "invoiceNumber": "INV-001", ... },
    { "id": "clx2def...", "invoiceNumber": "INV-002", ... }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

### Error

The `AllExceptionsFilter` normalizes all errors into a consistent format:

```json
{
  "statusCode": 422,
  "code": "JOURNAL_NOT_BALANCED",
  "message": "Journal entry must balance. Debits: 1000, Credits: 500",
  "error": "Business Rule Violation",
  "details": {
    "constraint": "balance",
    "value": { "debits": 1000, "credits": 500 },
    "expected": "debits === credits"
  },
  "timestamp": "2026-01-15T10:30:00.000Z",
  "path": "/api/journals",
  "requestId": "req_abc123"
}
```

### Validation Error (class-validator)

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "error": "Bad Request",
  "details": {
    "customerId": ["customerId must be a string"],
    "date": ["date must be a valid ISO 8601 date string"]
  },
  "timestamp": "2026-01-15T10:30:00.000Z",
  "path": "/api/invoices"
}
```

---

## Authentication Flow

Mizano uses JWT with refresh tokens. The full flow:

```
1. Register   POST /auth/register  -->  { user, organization, tokens }
2. Login      POST /auth/login     -->  { user, organization, tokens }
3. Use Token  Authorization: Bearer <accessToken>
4. Refresh    POST /auth/refresh   -->  { tokens: { accessToken, refreshToken } }
5. Logout     POST /auth/logout    -->  { message: "Logged out successfully" }
```

### Register

```typescript
// POST /auth/register
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd",
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "Acme Corp"
}
```

Registration creates the organization, default Admin role with full permissions, and user -- all within a single Prisma transaction. Tokens are returned immediately.

### Login

```typescript
// POST /auth/login
{ "email": "user@example.com", "password": "SecureP@ssw0rd" }

// Response
{
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "status": "ACTIVE",
    "organizationId": "clx...",
    "role": { "id": "clx...", "name": "Admin", "permissions": [...] }
  },
  "organization": { "id": "clx...", "name": "Acme Corp", "currency": "USD" },
  "tokens": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

### Token Details

| Token         | Secret               | Default Expiry |
| ------------- | -------------------- | -------------- |
| Access Token  | `JWT_SECRET`         | 15 minutes     |
| Refresh Token | `JWT_REFRESH_SECRET` | 7 days         |

JWT payload:

```typescript
{
  sub: userId,
  email: string,
  name: string,
  organizationId: string,
  roleId: string,
}
```

Refresh tokens are bcrypt-hashed and stored on the `User` model. On refresh, both tokens are rotated.

### Rate Limiting

Auth endpoints are throttled: maximum 5 requests per 60 seconds via `@Throttle({ short: { ttl: 60000, limit: 5 } })`.

---

## Guards Chain

Requests pass through guards in the following order:

```
Request
  --> JwtAuthGuard (validates JWT, attaches user to request)
  --> OrganizationGuard (ensures cross-tenant isolation)
  --> PermissionsGuard (checks RBAC permissions)
  --> Controller Method
```

### JwtAuthGuard

Extends Passport's `AuthGuard('jwt')`. Checks for the `@Public()` decorator to skip authentication on public routes (e.g., login, register).

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
```

### OrganizationGuard

Prevents users from accessing resources outside their organization. If `organizationId` is present in params, query, or body, it must match the user's organization.

```typescript
@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.organizationId) {
      throw new ForbiddenException('User organization not found');
    }

    const requestedOrgId =
      request.params?.organizationId ||
      request.query?.organizationId ||
      request.body?.organizationId;

    // If no org specified, allow (controller uses @CurrentOrg())
    if (!requestedOrgId) return true;

    if (user.organizationId !== requestedOrgId) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    return true;
  }
}
```

### PermissionsGuard

Loads the user's role and checks that all required permissions (set via `@Permissions()`) are present. Users with the "Admin" role bypass all permission checks.

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const user = context.switchToHttp().getRequest().user;
    const role = await this.prisma.role.findUnique({
      where: { id: user.roleId },
      include: { permissions: true },
    });

    // Admin bypasses everything
    if (role.name === 'Admin') return true;

    // Check each required permission: "module.action"
    for (const required of requiredPermissions) {
      const [module, action] = required.split('.');
      const permission = role.permissions.find((p) => p.module === module);
      if (!permission || !permission.actions.includes(action)) {
        throw new ForbiddenException(`Missing permission: ${required}`);
      }
    }

    return true;
  }
}
```

Permission strings follow the `module.action` format:

- `sales.view`, `sales.create`, `sales.edit`, `sales.delete`, `sales.export`
- `accounting.view`, `accounting.create`, `accounting.edit`, `accounting.delete`
- `settings.view`, `settings.edit`

---

## Custom Decorators

Located in `apps/api/src/common/decorators/`.

### @Public()

Marks a route as publicly accessible, bypassing `JwtAuthGuard`:

```typescript
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Usage
@Public()
@Post('login')
async login(@Body() loginDto: LoginDto) { ... }
```

### @CurrentOrg()

Extracts the authenticated user's `organizationId` from the request:

```typescript
export const CurrentOrg = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.organizationId;
  },
);

// Usage
@Get()
findAll(@CurrentOrg() orgId: string) { ... }
```

### @CurrentUser()

Extracts the full user object or a specific property from the JWT payload:

```typescript
export interface CurrentUserData {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData;
    return data ? user?.[data] : user;
  },
);

// Usage - full user
@Post('logout')
async logout(@CurrentUser() user: CurrentUserData) { ... }

// Usage - single field
@Get('me')
getProfile(@CurrentUser('email') email: string) { ... }
```

### @Permissions()

Sets required permissions as metadata for `PermissionsGuard`:

```typescript
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// Usage
@Post()
@Permissions('sales.create')
create(@CurrentOrg() orgId: string, @Body() dto: CreateInvoiceDto) { ... }

// Multiple permissions (all required)
@Patch(':id/approve')
@Permissions('sales.edit', 'accounting.create')
approve(@CurrentOrg() orgId: string, @Param('id') id: string) { ... }
```

---

## Document Number Generation

Each document type has an auto-incrementing number prefixed by a document type code:

| Document         | Format     | Example              |
| ---------------- | ---------- | -------------------- |
| Invoice          | `INV-XXX`  | `INV-001`, `INV-042` |
| Quote/Estimate   | `EST-XXX`  | `EST-001`            |
| Credit Note      | `CN-XXX`   | `CN-001`             |
| Journal          | `JRN-XXX`  | `JRN-001`            |
| Bill             | `BILL-XXX` | `BILL-001`           |
| Payment Received | `PMT-XXX`  | `PMT-001`            |
| Payment Made     | `PAY-XXX`  | `PAY-001`            |

Implementation pattern:

```typescript
private async generateInvoiceNumber(organizationId: string): Promise<string> {
  const lastInvoice = await this.prisma.invoice.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  if (!lastInvoice) {
    return 'INV-001';
  }

  const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[1], 10);
  return `INV-${String(lastNumber + 1).padStart(3, '0')}`;
}
```

Numbers are scoped per organization, so different organizations can have their own `INV-001`.

---

## Pagination Pattern

All list endpoints follow a consistent pagination pattern using `skip/take`:

```typescript
async findAll(organizationId: string, query: InvoiceQueryDto) {
  const {
    page = 1,
    limit = 20,
    search,
    sortBy = 'date',
    sortOrder = 'desc',
    status,
    customerId,
    dateFrom,
    dateTo,
  } = query;

  // Build dynamic where clause
  const where: any = {
    organizationId,
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  if (status) where.status = status;
  if (customerId) where.customerId = customerId;

  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }

  // Execute data query and count in parallel
  const [data, total] = await Promise.all([
    this.prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    this.prisma.invoice.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

Query parameters:

- `page` (default: 1) -- the page number, 1-indexed
- `limit` (default: 20, max: 100) -- items per page
- `search` -- full-text search across relevant fields (case-insensitive)
- `sortBy` -- field name to sort by
- `sortOrder` -- `asc` or `desc`
- Additional domain-specific filters (e.g., `status`, `customerId`, `dateFrom`, `dateTo`)

---

## Prisma Transactions

Use `prisma.$transaction()` for any operation that writes to multiple tables. This ensures atomicity.

### Registration (multi-table create)

```typescript
const result = await this.prisma.$transaction(async (tx) => {
  // Create organization
  const organization = await tx.organization.create({
    data: { name: organizationName, currency: 'USD' },
  });

  // Create default admin role with permissions
  const adminRole = await tx.role.create({
    data: {
      name: 'Admin',
      description: 'Full system access',
      isDefault: true,
      organizationId: organization.id,
      permissions: {
        create: [
          { module: 'accounting', actions: ['view', 'create', 'edit', 'delete', 'export'] },
          { module: 'sales', actions: ['view', 'create', 'edit', 'delete', 'export'] },
          // ...more modules
        ],
      },
    },
  });

  // Create user
  const user = await tx.user.create({
    data: {
      email,
      passwordHash,
      name,
      roleId: adminRole.id,
      organizationId: organization.id,
    },
  });

  return { organization, user };
});
```

### Payment recording (create + update)

```typescript
const payment = await this.prisma.$transaction(async (tx) => {
  const pr = await tx.paymentReceived.create({
    data: {
      paymentNumber,
      customerId: invoice.customerId,
      date: new Date(dto.date),
      amount: paymentAmount,
      paymentMode: 'BANK_TRANSFER',
      depositToAccountId: dto.bankAccountId,
      reference: dto.reference,
      organizationId,
      allocations: {
        create: {
          invoiceId: id,
          amount: paymentAmount,
        },
      },
    },
    include: {
      customer: { select: { id: true, name: true } },
      allocations: true,
    },
  });
  return pr;
});

// Update balance due after payment
await this.updateBalanceDue(id);
```

When to use transactions:

- Creating an entity with related child records (if they must all succeed)
- Recording payments (create payment + update invoice balance)
- Sending invoices (update status + create journal entries)
- Registration (create organization + role + user)
- Any operation where partial completion would leave data in an inconsistent state

---

## Error Handling

### NestJS Built-in Exceptions

Use these for standard HTTP error cases:

```typescript
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';

// Entity not found
if (!invoice) {
  throw new NotFoundException('Invoice not found');
}

// Invalid state
if (invoice.status !== 'DRAFT') {
  throw new BadRequestException('Only draft invoices can be updated');
}

// Payment validation
if (paymentAmount.greaterThan(balanceDue)) {
  throw new BadRequestException('Payment amount exceeds balance due');
}

// Duplicate
if (existingUser) {
  throw new ConflictException('Email already registered');
}
```

### BusinessRuleException

For domain-specific errors, use the custom `BusinessRuleException` class with semantic error codes:

```typescript
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';

// Journal not balanced
throw BusinessRuleException.journalNotBalanced(totalDebits, totalCredits);

// Insufficient inventory
throw BusinessRuleException.insufficientInventory(itemId, required, available);

// Period locked
throw BusinessRuleException.periodLocked(date, lockDate);

// Invoice already paid
throw BusinessRuleException.invoiceAlreadyPaid(invoiceNumber, paidAmount);

// Invalid state transition
throw BusinessRuleException.invalidStateTransition('DRAFT', 'PAID', ['SENT', 'PARTIALLY_PAID']);

// Custom business rule
throw new BusinessRuleException(
  'CUSTOM_CODE',
  'Human-readable explanation',
  { field: 'amount', value: 100, expected: '<= 50' },
  HttpStatus.UNPROCESSABLE_ENTITY,
);
```

Available static factory methods:

- `journalNotBalanced(debits, credits)`
- `insufficientInventory(itemId, required, available)`
- `periodLocked(date, lockDate)`
- `documentAlreadyPosted(documentType, documentNumber)`
- `invoiceAlreadyPaid(invoiceNumber, paidAmount)`
- `paymentExceedsBalance(amount, balance)`
- `duplicateDocument(documentType, identifier)`
- `invalidStateTransition(from, to, allowed)`
- `fiscalYearClosed(year)`
- `taxRateNotConfigured(taxCode)`
- `currencyMismatch(expected, actual)`
- `exchangeRateNotFound(from, to, date)`
- `accountNotFound(accountId)`
- `negativeBalance(accountName, balance)`
- `payrollAlreadyProcessed(period)`
- `employeeNotActive(employeeId)`
- `bomCycleDetected(itemId, path)`
- `organizationLimitReached(resource, limit)`

### Prisma Error Handling

The `AllExceptionsFilter` automatically translates Prisma errors:

| Prisma Code | HTTP Status     | Error Code                    |
| ----------- | --------------- | ----------------------------- |
| P2002       | 409 Conflict    | `UNIQUE_CONSTRAINT_VIOLATION` |
| P2003       | 400 Bad Request | `FOREIGN_KEY_VIOLATION`       |
| P2025       | 404 Not Found   | `RECORD_NOT_FOUND`            |
| P2014       | 400 Bad Request | `REQUIRED_RELATION_VIOLATION` |

---

## Soft Delete Pattern

Financial records are never hard-deleted. Instead they use a `deletedAt` timestamp:

```typescript
// Deleting (soft)
async remove(organizationId: string, id: string) {
  const invoice = await this.prisma.invoice.findFirst({
    where: { id, organizationId, deletedAt: null },
  });

  if (!invoice) {
    throw new NotFoundException('Invoice not found');
  }

  if (invoice.status !== 'DRAFT') {
    throw new BadRequestException('Only draft invoices can be deleted');
  }

  // Soft delete: set deletedAt
  await this.prisma.invoice.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return { message: 'Invoice deleted successfully' };
}
```

All queries for soft-deletable entities must exclude deleted records:

```typescript
// ALWAYS filter out deleted records
const invoice = await this.prisma.invoice.findFirst({
  where: { id, organizationId, deletedAt: null },
});

// In list queries
const where = {
  organizationId,
  deletedAt: null, // Required!
};
```

Models that use soft delete include: `Invoice`, `Bill`, `Quote`, `CreditNote`, `VendorCredit`, `Journal`, `PaymentReceived`, `PaymentMade`, `Customer`, `Vendor`.

---

## Audit Trail

The `AuditInterceptor` automatically logs all write operations (POST, PUT, PATCH, DELETE) to the `AuditLog` table:

```typescript
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const user = request.user;

    // Only audit write operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !user) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          const action = this.getAction(method); // CREATE | UPDATE | DELETE
          const entityType = this.getEntityType(request.path); // e.g., "invoices"
          const entityId = response?.id || request.params?.id || 'unknown';

          await this.prisma.auditLog.create({
            data: {
              userId: user.id,
              action,
              entityType,
              entityId,
              oldValues: null, // Can be set by service before update
              newValues: method !== 'DELETE' ? response : null,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
              organizationId: user.organizationId,
            },
          });
        } catch (error) {
          // Audit logging failure does not fail the request
          console.error('Audit logging failed:', error);
        }
      }),
    );
  }
}
```

Audit log schema:

- `userId` -- who performed the action
- `action` -- `CREATE`, `UPDATE`, or `DELETE`
- `entityType` -- derived from the URL path (e.g., `invoices`, `customers`)
- `entityId` -- the affected record's ID
- `oldValues` -- previous state (JSON, optional)
- `newValues` -- new state (JSON)
- `ipAddress` -- client IP
- `userAgent` -- client user agent string
- `organizationId` -- for multi-tenant scoping

Audit logs are queryable via the Audit Logs API:

- `GET /audit-logs` -- list with pagination
- `GET /audit-logs/:id` -- single entry
- `GET /audit-logs/entity/:entityType/:entityId` -- history for a specific entity
- `GET /audit-logs/stats` -- aggregated statistics
