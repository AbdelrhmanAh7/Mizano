import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VendorCreditsService } from '../services/vendor-credits.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Vendor Credits')
@ApiBearerAuth()
@Controller('vendor-credits')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VendorCreditsController {
  constructor(private readonly vendorCreditsService: VendorCreditsService) {}

  @Post()
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Create a vendor credit' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.vendorCreditsService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get all vendor credits' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto & { vendorId?: string }) {
    return this.vendorCreditsService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get vendor credit by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vendorCreditsService.findOne(orgId, id);
  }

  @Post(':id/apply-to-bill')
  @Permissions('purchases.edit')
  @ApiOperation({ summary: 'Apply vendor credit to a bill' })
  applyToBill(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { billId: string },
  ) {
    return this.vendorCreditsService.applyToBill(orgId, id, dto.billId);
  }

  @Post(':id/refund')
  @Permissions('purchases.edit')
  @ApiOperation({ summary: 'Record vendor credit refund' })
  refund(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { bankAccountId: string; date?: string },
  ) {
    return this.vendorCreditsService.refund(orgId, id, dto);
  }
}
