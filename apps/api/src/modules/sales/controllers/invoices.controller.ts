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
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';

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

  @Patch(':id/send')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Mark invoice as sent' })
  send(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.send(orgId, id);
  }

  @Patch(':id/void')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Void invoice' })
  void(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.voidInvoice(orgId, id);
  }

  @Post(':id/record-payment')
  @Permissions('sales.edit')
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
  @ApiOperation({ summary: 'Delete invoice' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.invoicesService.remove(orgId, id);
  }
}
