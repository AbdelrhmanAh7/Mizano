import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, InvalidatesLedger, Permissions } from '../../../common/decorators';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateVatReturnDto } from '../dto/create-vat-return.dto';
import { RecordVatPaymentDto } from '../dto/record-vat-payment.dto';
import { VatReturnQueryDto } from '../dto/vat-return-query.dto';
import { VatSummaryQueryDto } from '../dto/vat-summary-query.dto';
import { VatReturnsService } from '../services/vat-returns.service';

@ApiTags('VAT Returns')
@ApiBearerAuth()
@Controller('vat-returns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class VatReturnsController {
  constructor(private readonly vatReturnsService: VatReturnsService) {}

  @Post()
  @Permissions('tax.create')
  @ApiOperation({ summary: 'Create a new VAT return' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateVatReturnDto) {
    return this.vatReturnsService.create(orgId, dto);
  }

  @Get()
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get all VAT returns' })
  findAll(@CurrentOrg() orgId: string, @Query() query: VatReturnQueryDto) {
    return this.vatReturnsService.findAll(orgId, query);
  }

  @Get('dashboard-stats')
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get tax dashboard statistics' })
  getDashboardStats(@CurrentOrg() orgId: string) {
    return this.vatReturnsService.getDashboardStats(orgId);
  }

  @Get('summary')
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get the live VAT position for a period (from the posted ledger)' })
  getSummary(@CurrentOrg() orgId: string, @Query() query: VatSummaryQueryDto) {
    return this.vatReturnsService.getVatSummary(orgId, query.startDate, query.endDate);
  }

  @Get(':id')
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get VAT return by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.findOne(orgId, id);
  }

  @Post(':id/calculate')
  @Permissions('tax.edit')
  @ApiOperation({ summary: 'Calculate VAT return from the posted ledger' })
  calculate(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.calculate(orgId, id);
  }

  @Post(':id/submit')
  @Permissions('tax.submit')
  @InvalidatesLedger('vat-returns:*', 'tax:*')
  @ApiOperation({ summary: 'Submit VAT return and post its settlement journal' })
  submit(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.submit(orgId, id);
  }

  @Post(':id/file')
  @Permissions('tax.submit')
  @InvalidatesLedger('vat-returns:*', 'tax:*')
  @ApiOperation({ summary: 'Mark a submitted zero/refundable VAT return as filed (no journal)' })
  fileReturn(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.fileReturn(orgId, id);
  }

  @Post(':id/payment')
  @Permissions('tax.edit')
  @InvalidatesLedger('vat-returns:*', 'tax:*')
  @ApiOperation({ summary: 'Record VAT payment (Dr VAT Payable / Cr bank)' })
  recordPayment(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: RecordVatPaymentDto,
  ) {
    return this.vatReturnsService.recordPayment(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('tax.delete')
  @ApiOperation({ summary: 'Delete a draft or calculated VAT return' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.deleteReturn(orgId, id);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('tax.delete')
  @ApiOperation({ summary: 'Bulk delete draft or calculated VAT returns' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.vatReturnsService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-submit')
  @Permissions('tax.submit')
  @InvalidatesLedger('vat-returns:*', 'tax:*')
  @ApiOperation({ summary: 'Bulk submit calculated VAT returns (one settlement journal each)' })
  bulkSubmit(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.vatReturnsService.bulkSubmit(orgId, dto.ids);
  }
}
