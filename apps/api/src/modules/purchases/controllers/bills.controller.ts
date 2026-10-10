import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DuplicateCheckResult } from '@mizano/shared-types';
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  HttpCache,
  InvalidateCache,
  InvalidatesLedger,
  Permissions,
  SkipAudit,
} from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { BillCursorQueryDto } from '../dto/bill-cursor-query.dto';
import { BillQueryDto } from '../dto/bill-query.dto';
import { CheckDuplicateBillDto } from '../dto/check-duplicate-bill.dto';
import { CheckPossibleDuplicateBillsDto } from '../dto/check-possible-duplicate-bills.dto';
import { CreateBillDto } from '../dto/create-bill.dto';
import { UpdateBillDto } from '../dto/update-bill.dto';
import { BillsService } from '../services/bills.service';
import { PaymentsMadeService } from '../services/payments-made.service';
import { BulkPayBillsDto } from '../dto/bulk-pay-bills.dto';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';

@ApiTags('Bills')
@ApiBearerAuth()
@Controller('bills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class BillsController {
  constructor(
    private readonly billsService: BillsService,
    private readonly paymentsMadeService: PaymentsMadeService,
  ) {}

  @Post('check-duplicate')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Check for potential duplicate bills' })
  checkDuplicate(@CurrentOrg() orgId: string, @Body() dto: CheckDuplicateBillDto) {
    return this.billsService.checkDuplicate(orgId, dto);
  }

  @Post()
  @Permissions('purchases.create')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Create a new bill' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateBillDto) {
    return this.billsService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('bills:list')
  @CacheTTL(120)
  @HttpCache('short')
  @ApiOperation({ summary: 'Get all bills' })
  findAll(@CurrentOrg() orgId: string, @Query() query: BillQueryDto) {
    return this.billsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'List bills with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: BillCursorQueryDto) {
    return this.billsService.findAllCursor(orgId, query);
  }

  /** A read-only query sent as POST so amounts and vendor names stay out of logged URLs. */
  @Post('possible-duplicates')
  @HttpCode(HttpStatus.OK)
  @SkipAudit()
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Find possible duplicate bills for a draft bill or document' })
  findPossibleDuplicates(
    @CurrentOrg() orgId: string,
    @Body() dto: CheckPossibleDuplicateBillsDto,
  ): Promise<DuplicateCheckResult> {
    return this.billsService.findPossibleDuplicateBills(orgId, dto);
  }

  @Get(':id/possible-duplicates')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Find possible duplicate bills for an existing draft bill' })
  findPossibleDuplicatesForBill(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
  ): Promise<DuplicateCheckResult> {
    return this.billsService.findPossibleDuplicateBills(orgId, { billId: id });
  }

  @Get(':id')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get bill by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('purchases.edit')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Update bill' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateBillDto) {
    return this.billsService.update(orgId, id, dto);
  }

  @Patch(':id/open')
  @Permissions('purchases.edit')
  @InvalidatesLedger('bills:*')
  @ApiOperation({ summary: 'Open a draft bill (change status DRAFT → OPEN)' })
  open(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.open(orgId, id);
  }

  @Post(':id/clone')
  @Permissions('purchases.create')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Clone a bill as a new draft' })
  clone(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.clone(orgId, id);
  }

  @Post(':id/approve')
  @Permissions('purchases.edit')
  @InvalidatesLedger('bills:*')
  @ApiOperation({ summary: 'Approve bill' })
  approve(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.approve(orgId, id);
  }

  @Delete(':id')
  @Permissions('purchases.delete')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Delete bill' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.remove(orgId, id);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('purchases.delete')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Bulk delete draft bills' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.billsService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-open')
  @Permissions('purchases.edit')
  @InvalidatesLedger('bills:*')
  @ApiOperation({ summary: 'Bulk open (approve and post) draft bills' })
  bulkOpen(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.billsService.bulkOpen(orgId, dto.ids);
  }

  @Post('bulk-approve')
  @Permissions('purchases.edit')
  @InvalidatesLedger('bills:*')
  @ApiOperation({ summary: 'Bulk approve draft bills' })
  bulkApprove(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.billsService.bulkApprove(orgId, dto.ids);
  }

  @Post('bulk-pay')
  // Records real payments: same permission as creating a payment.
  @Permissions('purchases.create')
  @InvalidatesLedger('bills:*', 'payments-made:*')
  @ApiOperation({ summary: 'Pay the full balance of each bill (records real payments)' })
  bulkPay(@CurrentOrg() orgId: string, @Body() dto: BulkPayBillsDto) {
    const { ids, ...options } = dto;
    return this.paymentsMadeService.bulkPayBills(orgId, ids, options);
  }
}
