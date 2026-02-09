import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  InvalidateCache,
  Permissions,
} from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { InvoiceCursorQueryDto } from '../dto/invoice-cursor-query.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { InvoicesService } from '../services/invoices.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Permissions('sales.create')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Create a new invoice' })
  create(@CurrentOrg() orgId: string, @Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoicesService.create(orgId, createInvoiceDto);
  }

  @Get()
  @Permissions('sales.view')
  @CacheResponse('invoices:list')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Get all invoices' })
  findAll(@CurrentOrg() orgId: string, @Query() query: InvoiceQueryDto) {
    return this.invoicesService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'List invoices with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: InvoiceCursorQueryDto) {
    return this.invoicesService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get invoice by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Update invoice' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(orgId, id, updateInvoiceDto);
  }

  @Patch(':id/send')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Mark invoice as sent' })
  send(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.send(orgId, id);
  }

  @Patch(':id/void')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Void invoice' })
  void(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.voidInvoice(orgId, id);
  }

  @Post(':id/record-payment')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*', 'payments-received:*')
  @ApiOperation({ summary: 'Record payment for invoice' })
  recordPayment(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { amount: number; date: string; bankAccountId: string; reference?: string },
  ) {
    return this.invoicesService.recordPayment(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Delete invoice' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.remove(orgId, id);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Bulk delete draft invoices' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.invoicesService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-send')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Bulk send invoices' })
  bulkSend(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.invoicesService.bulkSend(orgId, dto.ids);
  }

  @Post('bulk-void')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Bulk void invoices' })
  bulkVoid(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.invoicesService.bulkVoid(orgId, dto.ids);
  }

  @Post('bulk-pay')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*')
  @ApiOperation({ summary: 'Bulk mark invoices as paid' })
  bulkPay(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.invoicesService.bulkPay(orgId, dto.ids);
  }
}
