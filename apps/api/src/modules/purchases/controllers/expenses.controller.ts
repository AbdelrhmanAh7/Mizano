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
import { CreateExpenseDto } from '../dto/create-expense.dto';
import { BulkCategorizeExpensesDto } from '../dto/bulk-categorize-expenses.dto';
import { ExpenseQueryDto } from '../dto/expense-query.dto';
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
  @InvalidatesLedger('expenses:*')
  @ApiOperation({ summary: 'Record an expense (posts Dr expense / VAT, Cr bank or cash)' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('expenses:list')
  @CacheTTL(120)
  findAll(@CurrentOrg() orgId: string, @Query() query: ExpenseQueryDto) {
    return this.expensesService.findAll(orgId, query);
  }

  @Get('expense-accounts')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Expense accounts selectable on the expense form (purchases.create)' })
  expenseAccounts(@CurrentOrg() orgId: string) {
    return this.expensesService.expenseAccounts(orgId);
  }

  @Get('paid-through-accounts')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Bank/cash accounts an expense can be paid from (purchases.create)' })
  paidThroughAccounts(@CurrentOrg() orgId: string) {
    return this.expensesService.paidThroughAccounts(orgId);
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

  @Post(':id/post')
  @Permissions('purchases.edit')
  @InvalidatesLedger('expenses:*')
  @ApiOperation({ summary: 'Post a pending expense (Dr expense / VAT, Cr bank or cash)' })
  post(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.expensesService.post(orgId, id);
  }

  @Delete(':id')
  @Permissions('purchases.delete')
  @InvalidatesLedger('expenses:*')
  @ApiOperation({ summary: 'Void an expense (posts a reversal journal)' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.expensesService.remove(orgId, id);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('purchases.delete')
  @InvalidatesLedger('expenses:*')
  @ApiOperation({ summary: 'Bulk void expenses (per-record outcomes)' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.expensesService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-categorize')
  @Permissions('purchases.edit')
  @InvalidateCache('expenses:*')
  bulkCategorize(@CurrentOrg() orgId: string, @Body() dto: BulkCategorizeExpensesDto) {
    return this.expensesService.bulkCategorize(orgId, dto.ids, dto.accountId);
  }

  @Post('bulk-approve')
  @Permissions('purchases.edit')
  @InvalidatesLedger('expenses:*')
  @ApiOperation({ summary: 'Bulk post pending expenses (per-record outcomes)' })
  bulkApprove(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.expensesService.bulkApprove(orgId, dto.ids);
  }
}
