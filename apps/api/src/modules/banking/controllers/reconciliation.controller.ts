import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, InvalidateCache, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { ReconciliationService } from '../services/reconciliation.service';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('summary/:bankAccountId')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get reconciliation summary for a bank account' })
  getSummary(@CurrentOrg() orgId: string, @Param('bankAccountId') bankAccountId: string) {
    return this.reconciliationService.getSummary(orgId, bankAccountId);
  }

  @Get('suggestions/:bankAccountId')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get AI reconciliation suggestions' })
  getSuggestions(@CurrentOrg() orgId: string, @Param('bankAccountId') bankAccountId: string) {
    return this.reconciliationService.getSuggestions(orgId, bankAccountId);
  }

  @Post('confirm')
  @Permissions('banking.edit')
  @InvalidateCache('reconciliation:*', 'bank-transactions:*')
  @ApiOperation({ summary: 'Confirm reconciliation match' })
  confirmMatch(
    @CurrentOrg() orgId: string,
    @Body() dto: { transactionId: string; entityType: string; entityId: string },
  ) {
    return this.reconciliationService.confirmMatch(
      orgId,
      dto.transactionId,
      dto.entityType,
      dto.entityId,
    );
  }

  @Post('create-expense')
  @Permissions('banking.create')
  @InvalidateCache('reconciliation:*', 'bank-transactions:*', 'expenses:*')
  @ApiOperation({ summary: 'Create expense from unmatched transaction' })
  createExpense(
    @CurrentOrg() orgId: string,
    @Body() dto: { transactionId: string; accountId: string; vendorId?: string },
  ) {
    return this.reconciliationService.createExpenseFromTransaction(
      orgId,
      dto.transactionId,
      dto.accountId,
      dto.vendorId,
    );
  }
}
