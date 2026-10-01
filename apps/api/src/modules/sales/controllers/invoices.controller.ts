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
  HttpCache,
  InvalidateCache,
  InvalidatesLedger,
  Permissions,
} from '../../../common/decorators';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { BulkPayInvoicesDto } from '../dto/bulk-pay-invoices.dto';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { InvoiceCursorQueryDto } from '../dto/invoice-cursor-query.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';
import { RecordInvoicePaymentDto } from '../dto/record-invoice-payment.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { InvoicesService } from '../services/invoices.service';
import { PaymentsReceivedService } from '../services/payments-received.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentsReceivedService: PaymentsReceivedService,
  ) {}

  @Post()
  @Permissions('sales.create')
  @InvalidateCache('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Create a new draft invoice' })
  create(@CurrentOrg() orgId: string, @Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoicesService.create(orgId, createInvoiceDto);
  }

  @Get()
  @Permissions('sales.view')
  @CacheResponse('invoices:list')
  @CacheTTL(120)
  @HttpCache('short')
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

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @InvalidateCache('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Bulk delete draft invoices' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.invoicesService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-send')
  @Permissions('sales.edit')
  @InvalidatesLedger('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Bulk send (post to the ledger) draft invoices' })
  bulkSend(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.invoicesService.bulkSend(orgId, dto.ids);
  }

  @Post('bulk-void')
  @Permissions('sales.edit')
  @InvalidatesLedger('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Bulk void invoices (reverses the journal of sent invoices)' })
  bulkVoid(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.invoicesService.bulkVoid(orgId, dto.ids);
  }

  @Post('bulk-pay')
  // Records real payments: same permission as creating a payment received.
  @Permissions('sales.create')
  @InvalidatesLedger('invoices:*', 'payments-received:*', 'customers:*')
  @ApiOperation({ summary: 'Receive the full balance of each invoice (records real payments)' })
  bulkPay(@CurrentOrg() orgId: string, @Body() dto: BulkPayInvoicesDto) {
    const { ids, ...options } = dto;
    return this.paymentsReceivedService.bulkPayInvoices(orgId, ids, options);
  }

  @Get(':id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get invoice by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('sales.edit')
  @InvalidateCache('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Update a draft invoice' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(orgId, id, updateInvoiceDto);
  }

  @Patch(':id/send')
  @Permissions('sales.edit')
  @InvalidatesLedger('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Send an invoice: DRAFT -> SENT and post Dr AR / Cr Revenue / Cr VAT' })
  send(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.send(orgId, id);
  }

  @Patch(':id/void')
  @Permissions('sales.edit')
  @InvalidatesLedger('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Void an invoice (reverses the journal of a sent invoice)' })
  void(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.voidInvoice(orgId, id);
  }

  @Post(':id/record-payment')
  // Records a real payment: same permission as creating a payment received.
  @Permissions('sales.create')
  @InvalidatesLedger('invoices:*', 'payments-received:*', 'customers:*')
  @ApiOperation({ summary: 'Record a payment for one invoice (payment + allocation + journal)' })
  recordPayment(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: RecordInvoicePaymentDto,
  ) {
    return this.paymentsReceivedService.recordForInvoice(orgId, id, dto);
  }

  @Post(':id/clone')
  @Permissions('sales.create')
  @InvalidateCache('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Clone an invoice as a new draft' })
  clone(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.clone(orgId, id);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @InvalidateCache('invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Delete a draft invoice' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.remove(orgId, id);
  }
}
