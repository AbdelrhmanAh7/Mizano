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
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  InvalidateCache,
  InvalidatesLedger,
  Permissions,
} from '../../../common/decorators';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { ApplyVendorCreditDto } from '../dto/apply-vendor-credit.dto';
import { CreateVendorCreditDto } from '../dto/create-vendor-credit.dto';
import { RefundVendorCreditDto } from '../dto/refund-vendor-credit.dto';
import { VendorCreditQueryDto } from '../dto/vendor-credit-query.dto';
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
  @InvalidatesLedger('vendor-credits:*', 'bills:*', 'vendors:*')
  @ApiOperation({ summary: 'Create a vendor credit (posts Dr AP / Cr expense and VAT)' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateVendorCreditDto) {
    return this.vendorCreditsService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('vendor-credits:list')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Get all vendor credits' })
  findAll(@CurrentOrg() orgId: string, @Query() query: VendorCreditQueryDto) {
    return this.vendorCreditsService.findAll(orgId, query);
  }

  @Post('bulk-delete')
  @Permissions('purchases.delete')
  @InvalidatesLedger('vendor-credits:*', 'bills:*', 'vendors:*')
  @ApiOperation({ summary: 'Bulk void vendor credits (per-record outcomes)' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.vendorCreditsService.bulkDelete(orgId, dto.ids);
  }

  @Get('cursor')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'List vendor credits with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.vendorCreditsService.findAllCursor(orgId, query);
  }

  @Get('credit-accounts')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Expense accounts a vendor credit can be posted to (purchases.create)' })
  creditAccounts(@CurrentOrg() orgId: string) {
    return this.vendorCreditsService.creditAccounts(orgId);
  }

  @Get('refund-accounts')
  @Permissions('purchases.edit')
  @ApiOperation({ summary: 'Bank/cash accounts a refund can be received into (purchases.edit)' })
  refundAccounts(@CurrentOrg() orgId: string) {
    return this.vendorCreditsService.refundAccounts(orgId);
  }

  @Get(':id')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get vendor credit by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vendorCreditsService.findOne(orgId, id);
  }

  @Delete(':id')
  @Permissions('purchases.delete')
  @InvalidatesLedger('vendor-credits:*', 'bills:*', 'vendors:*')
  @ApiOperation({ summary: 'Void an unapplied, unrefunded vendor credit (posts a reversal)' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vendorCreditsService.void(orgId, id);
  }

  @Post(':id/apply-to-bill')
  @Permissions('purchases.edit')
  @InvalidateCache('vendor-credits:*', 'bills:*', 'vendors:*')
  @ApiOperation({ summary: 'Apply vendor credit to a bill balance (no journal)' })
  applyToBill(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: ApplyVendorCreditDto,
  ) {
    return this.vendorCreditsService.applyToBill(orgId, id, dto.billId);
  }

  @Post(':id/refund')
  @Permissions('purchases.edit')
  @InvalidatesLedger('vendor-credits:*', 'vendors:*')
  @ApiOperation({ summary: 'Record vendor credit refund (posts Dr bank / Cr AP)' })
  refund(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: RefundVendorCreditDto) {
    return this.vendorCreditsService.refund(orgId, id, dto);
  }
}
