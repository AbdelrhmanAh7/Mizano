import {
  Body,
  Controller,
  Get,
  Param,
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
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateVendorCreditDto } from '../dto/create-vendor-credit.dto';
import { VendorCreditsService } from '../services/vendor-credits.service';

@ApiTags('Vendor Credits')
@ApiBearerAuth()
@Controller('vendor-credits')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class VendorCreditsController {
  constructor(private readonly vendorCreditsService: VendorCreditsService) {}

  @Post()
  @Permissions('purchases.create')
  @InvalidateCache('vendor-credits:*')
  @ApiOperation({ summary: 'Create a vendor credit' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateVendorCreditDto) {
    return this.vendorCreditsService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('vendor-credits:list')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Get all vendor credits' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto & { vendorId?: string }) {
    return this.vendorCreditsService.findAll(orgId, query);
  }

  @Post('bulk-delete')
  @Permissions('purchases.delete')
  @InvalidateCache('vendor-credits:*')
  @ApiOperation({ summary: 'Bulk delete vendor credits' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.vendorCreditsService.bulkDelete(orgId, dto.ids);
  }

  @Get('cursor')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'List vendor credits with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.vendorCreditsService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get vendor credit by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vendorCreditsService.findOne(orgId, id);
  }

  @Post(':id/apply-to-bill')
  @Permissions('purchases.edit')
  @InvalidateCache('vendor-credits:*', 'bills:*')
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
  @InvalidateCache('vendor-credits:*')
  @ApiOperation({ summary: 'Record vendor credit refund' })
  refund(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { bankAccountId: string; date?: string },
  ) {
    return this.vendorCreditsService.refund(orgId, id, dto);
  }
}
