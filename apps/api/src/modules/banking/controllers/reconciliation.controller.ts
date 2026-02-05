import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReconciliationService } from '../services/reconciliation.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('suggestions/:bankAccountId')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get AI reconciliation suggestions' })
  getSuggestions(@CurrentOrg() orgId: string, @Param('bankAccountId') bankAccountId: string) {
    return this.reconciliationService.getSuggestions(orgId, bankAccountId);
  }

  @Post('confirm')
  @Permissions('banking.edit')
  @ApiOperation({ summary: 'Confirm reconciliation match' })
  confirmMatch(@CurrentOrg() orgId: string, @Body() dto: { transactionId: string; entityType: string; entityId: string }) {
    return this.reconciliationService.confirmMatch(orgId, dto.transactionId, dto.entityType, dto.entityId);
  }

  @Post('create-expense')
  @Permissions('banking.create')
  @ApiOperation({ summary: 'Create expense from unmatched transaction' })
  createExpense(@CurrentOrg() orgId: string, @Body() dto: { transactionId: string; accountId: string; vendorId?: string }) {
    return this.reconciliationService.createExpenseFromTransaction(orgId, dto.transactionId, dto.accountId, dto.vendorId);
  }
}
