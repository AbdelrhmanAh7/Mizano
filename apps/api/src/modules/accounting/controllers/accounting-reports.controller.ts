import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AccountingReportsService } from '../services/accounting-reports.service';

@ApiTags('Accounting Reports')
@ApiBearerAuth()
@Controller('accounting-reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingReportsController {
  constructor(private readonly accountingReportsService: AccountingReportsService) {}

  @Get('trial-balance')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get trial balance report' })
  getTrialBalance(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate?: string) {
    return this.accountingReportsService.getTrialBalance(orgId, asOfDate);
  }

  @Get('general-ledger/:accountId')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get general ledger for an account' })
  getGeneralLedger(
    @CurrentOrg() orgId: string,
    @Param('accountId') accountId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.accountingReportsService.getGeneralLedger(orgId, accountId, dateFrom, dateTo);
  }
}
