import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { VatReturnsService } from '../services/vat-returns.service';

@ApiTags('VAT Returns')
@ApiBearerAuth()
@Controller('vat-returns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VatReturnsController {
  constructor(private readonly vatReturnsService: VatReturnsService) {}

  @Post()
  @Permissions('tax.create')
  @ApiOperation({ summary: 'Create a new VAT return' })
  create(@CurrentOrg() orgId: string, @Body() dto: { startDate: string; endDate: string }) {
    return this.vatReturnsService.create(orgId, dto);
  }

  @Get()
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get all VAT returns' })
  findAll(@CurrentOrg() orgId: string, @Query() query: { status?: string; year?: number }) {
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
  @ApiOperation({ summary: 'Get VAT summary for period' })
  getSummary(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.vatReturnsService.getVatSummary(orgId, startDate, endDate);
  }

  @Get(':id')
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get VAT return by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.findOne(orgId, id);
  }

  @Post(':id/calculate')
  @Permissions('tax.edit')
  @ApiOperation({ summary: 'Calculate VAT return' })
  calculate(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.calculate(orgId, id);
  }

  @Post(':id/submit')
  @Permissions('tax.submit')
  @ApiOperation({ summary: 'Submit VAT return' })
  submit(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.submit(orgId, id);
  }

  @Post(':id/payment')
  @Permissions('tax.edit')
  @ApiOperation({ summary: 'Record VAT payment' })
  recordPayment(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { amount: number; date: string; paidFromAccountId: string; reference?: string },
  ) {
    return this.vatReturnsService.recordPayment(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('tax.delete')
  @ApiOperation({ summary: 'Delete VAT return' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vatReturnsService.deleteReturn(orgId, id);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('tax.delete')
  @ApiOperation({ summary: 'Bulk delete draft VAT returns' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.vatReturnsService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-submit')
  @Permissions('tax.submit')
  @ApiOperation({ summary: 'Bulk submit calculated VAT returns' })
  bulkSubmit(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.vatReturnsService.bulkSubmit(orgId, dto.ids);
  }
}
