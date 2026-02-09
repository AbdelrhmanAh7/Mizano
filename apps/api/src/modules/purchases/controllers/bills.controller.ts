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
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CheckDuplicateBillDto } from '../dto/check-duplicate-bill.dto';
import { BillsService } from '../services/bills.service';

@ApiTags('Bills')
@ApiBearerAuth()
@Controller('bills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

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
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.billsService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('bills:list')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Get all bills' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.billsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'List bills with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.billsService.findAllCursor(orgId, query);
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
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.billsService.update(orgId, id, dto);
  }

  @Post(':id/approve')
  @Permissions('purchases.edit')
  @InvalidateCache('bills:*')
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
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.billsService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-open')
  @Permissions('purchases.edit')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Bulk open draft bills' })
  bulkOpen(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.billsService.bulkOpen(orgId, dto.ids);
  }

  @Post('bulk-approve')
  @Permissions('purchases.edit')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Bulk approve draft bills' })
  bulkApprove(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.billsService.bulkApprove(orgId, dto.ids);
  }

  @Post('bulk-pay')
  @Permissions('purchases.edit')
  @InvalidateCache('bills:*')
  @ApiOperation({ summary: 'Bulk mark bills as paid' })
  bulkPay(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.billsService.bulkPay(orgId, dto.ids);
  }
}
