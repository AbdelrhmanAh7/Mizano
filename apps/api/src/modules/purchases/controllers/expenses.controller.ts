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
  Permissions,
} from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { ExpensesService } from '../services/expenses.service';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Permissions('purchases.create')
  @InvalidateCache('expenses:*')
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.expensesService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('expenses:list')
  @CacheTTL(120)
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.expensesService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'List expenses with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.expensesService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('purchases.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.expensesService.findOne(orgId, id);
  }

  @Delete(':id')
  @Permissions('purchases.delete')
  @InvalidateCache('expenses:*')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.expensesService.remove(orgId, id);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('purchases.delete')
  @InvalidateCache('expenses:*')
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.expensesService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-categorize')
  @Permissions('purchases.edit')
  @InvalidateCache('expenses:*')
  bulkCategorize(@CurrentOrg() orgId: string, @Body() dto: { ids: string[]; accountId: string }) {
    return this.expensesService.bulkCategorize(orgId, dto.ids, dto.accountId);
  }

  @Post('bulk-approve')
  @Permissions('purchases.edit')
  @InvalidateCache('expenses:*')
  @ApiOperation({ summary: 'Bulk approve expenses' })
  bulkApprove(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.expensesService.bulkApprove(orgId, dto.ids);
  }
}
