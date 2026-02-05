import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BankTransactionsService } from '../services/bank-transactions.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Bank Transactions')
@ApiBearerAuth()
@Controller('bank-transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankTransactionsController {
  constructor(private readonly bankTransactionsService: BankTransactionsService) {}

  @Post() @Permissions('banking.create')
  @ApiOperation({ summary: 'Create/Import bank transaction' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.bankTransactionsService.create(orgId, dto); }

  @Post('import') @Permissions('banking.create')
  @ApiOperation({ summary: 'Bulk import transactions' })
  bulkImport(@CurrentOrg() orgId: string, @Body() dto: { bankAccountId: string; transactions: any[] }) {
    return this.bankTransactionsService.bulkImport(orgId, dto.bankAccountId, dto.transactions);
  }

  @Get() @Permissions('banking.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto & { bankAccountId?: string; status?: string }) {
    return this.bankTransactionsService.findAll(orgId, query);
  }

  @Get(':id') @Permissions('banking.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.bankTransactionsService.findOne(orgId, id); }
}
