import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TaxRatesService } from '../services/tax-rates.service';
import { CurrentOrg, HttpCache, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Tax Rates')
@ApiBearerAuth()
@Controller('tax-rates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaxRatesController {
  constructor(private readonly taxRatesService: TaxRatesService) {}

  @Post()
  @Permissions('tax.create')
  @ApiOperation({ summary: 'Create a new tax rate' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.taxRatesService.create(orgId, dto);
  }

  @Get()
  @Permissions('tax.view')
  @HttpCache('static')
  @ApiOperation({ summary: 'Get all tax rates' })
  findAll(@CurrentOrg() orgId: string, @Query() query: { type?: string; isActive?: boolean }) {
    return this.taxRatesService.findAll(orgId, query);
  }

  @Get('default')
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get default tax rate' })
  getDefault(@CurrentOrg() orgId: string) {
    return this.taxRatesService.getDefaultTaxRate(orgId);
  }

  @Get(':id')
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Get tax rate by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.taxRatesService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('tax.edit')
  @ApiOperation({ summary: 'Update tax rate' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.taxRatesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('tax.delete')
  @ApiOperation({ summary: 'Delete tax rate' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.taxRatesService.remove(orgId, id);
  }

  @Post('seed-defaults')
  @Permissions('tax.create')
  @ApiOperation({ summary: 'Seed default tax rates' })
  seedDefaults(@CurrentOrg() orgId: string, @Body() dto: { linkedAccountId: string }) {
    return this.taxRatesService.seedDefaultTaxRates(orgId, dto.linkedAccountId);
  }
}
