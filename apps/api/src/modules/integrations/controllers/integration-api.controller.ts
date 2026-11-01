import { BRAND } from '@mizano/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { InvalidateCache, Permissions } from '../../../common/decorators';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateCustomerDto } from '../../sales/dto/create-customer.dto';
import { CreateInvoiceDto } from '../../sales/dto/create-invoice.dto';
import {
  CreateIntegrationNoteDto,
  IntegrationCustomerQueryDto,
  IntegrationInvoiceQueryDto,
  IntegrationNoteQueryDto,
} from '../dto/integration-api.dto';
import {
  IntegrationApiKeyGuard,
  IntegrationPrincipal,
  RequireScopes,
} from '../guards/integration-api-key.guard';
import { IdempotentResult, IntegrationApiService } from '../services/integration-api.service';

type AuthedRequest = Request & { user: IntegrationPrincipal };

/**
 * Machine API for FlowLine (and any other automation): `Authorization: Bearer mzk_…`.
 * Every route needs both a key scope and the matching role permission of the key's creator.
 */
@ApiTags('Integrations API (v1)')
@ApiBearerAuth()
@Controller('integrations/v1')
@UseGuards(IntegrationApiKeyGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class IntegrationApiController {
  constructor(private readonly api: IntegrationApiService) {}

  @Get('me')
  @ApiOperation({ summary: 'Connection test: organization, key name and scopes' })
  me(@Req() req: AuthedRequest) {
    return this.api.me(req.user);
  }

  // ── Customers ──
  @Get('customers')
  @RequireScopes('customers:read')
  @Permissions('sales.view')
  listCustomers(@Req() req: AuthedRequest, @Query() q: IntegrationCustomerQueryDto) {
    return this.api.listCustomers(req.user.organizationId, q);
  }

  @Get('customers/:id')
  @RequireScopes('customers:read')
  @Permissions('sales.view')
  getCustomer(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.api.getCustomer(req.user.organizationId, id);
  }

  @Get('customers/:id/balance')
  @RequireScopes('balances:read')
  @Permissions('sales.view')
  customerBalance(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.api.getCustomerBalance(req.user.organizationId, id);
  }

  @Post('customers')
  @RequireScopes('customers:write')
  @Permissions('sales.create')
  @InvalidateCache('customers:*')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async createCustomer(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.reply(
      res,
      await this.api.idempotent(req.user, key, this.describe(req), 201, (tx) =>
        this.api.createCustomer(req.user.organizationId, dto, tx),
      ),
    );
  }

  // ── Invoices ──
  @Get('invoices')
  @RequireScopes('invoices:read')
  @Permissions('sales.view')
  listInvoices(@Req() req: AuthedRequest, @Query() q: IntegrationInvoiceQueryDto) {
    return this.api.listInvoices(req.user.organizationId, q);
  }

  @Get('invoices/:id')
  @RequireScopes('invoices:read')
  @Permissions('sales.view')
  getInvoice(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.api.getInvoice(req.user.organizationId, id);
  }

  @Post('invoices')
  @RequireScopes('invoices:write')
  @Permissions('sales.create')
  @InvalidateCache('invoices:*', 'customers:*')
  @ApiOperation({
    summary: `Create a DRAFT invoice (an accountant sends/posts it in ${BRAND.name.en})`,
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async createInvoice(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.reply(
      res,
      await this.api.idempotent(req.user, key, this.describe(req), 201, (tx) =>
        this.api.createInvoice(req.user.organizationId, dto, tx),
      ),
    );
  }

  // ── Balances ──
  @Get('balances')
  @RequireScopes('balances:read')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Organization receivables: outstanding, overdue, net of credits' })
  balances(@Req() req: AuthedRequest) {
    return this.api.balancesSummary(req.user.organizationId);
  }

  // ── Notes ──
  @Post('notes')
  @RequireScopes('notes:write')
  @Permissions('sales.view')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async createNote(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateIntegrationNoteDto,
  ) {
    return this.reply(
      res,
      await this.api.idempotent(req.user, key, this.describe(req), 201, (tx, afterCommit) =>
        this.api.createNote(req.user, dto, tx, afterCommit),
      ),
    );
  }

  @Get('notes')
  @RequireScopes('notes:write')
  @Permissions('sales.view')
  listNotes(@Req() req: AuthedRequest, @Query() q: IntegrationNoteQueryDto) {
    return this.api.listNotes(req.user.organizationId, q);
  }

  private describe(req: AuthedRequest): { method: string; path: string; body: unknown } {
    return { method: req.method, path: req.path, body: req.body };
  }

  private reply(res: Response, result: IdempotentResult): unknown {
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }
}
