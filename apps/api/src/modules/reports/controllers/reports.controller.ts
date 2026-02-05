import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FinancialReportsService } from '../services/financial-reports.service';
import { AgingReportsService } from '../services/aging-reports.service';
import { DashboardService } from '../services/dashboard.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly financialReportsService: FinancialReportsService,
    private readonly agingReportsService: AgingReportsService,
    private readonly dashboardService: DashboardService,
  ) {}

  // Dashboard
  @Get('dashboard')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get dashboard overview' })
  getDashboard(@CurrentOrg() orgId: string) {
    return this.dashboardService.getDashboardOverview(orgId);
  }

  @Get('dashboard/revenue-chart')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get revenue chart data' })
  getRevenueChart(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getRevenueChart(orgId, months ? parseInt(months) : 12);
  }

  @Get('dashboard/cash-flow-chart')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get cash flow chart data' })
  getCashFlowChart(@CurrentOrg() orgId: string, @Query('days') days?: string) {
    return this.dashboardService.getCashFlowChart(orgId, days ? parseInt(days) : 30);
  }

  @Get('dashboard/top-customers')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get top customers by revenue' })
  getTopCustomers(@CurrentOrg() orgId: string, @Query('limit') limit?: string) {
    return this.dashboardService.getTopCustomers(orgId, limit ? parseInt(limit) : 5);
  }

  @Get('dashboard/expenses-by-category')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get expenses by category' })
  getExpensesByCategory(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.dashboardService.getExpensesByCategory(orgId, startDate, endDate);
  }

  @Get('dashboard/projects')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get projects overview' })
  getProjectsOverview(@CurrentOrg() orgId: string) {
    return this.dashboardService.getProjectsOverview(orgId);
  }

  // Financial Reports
  @Get('profit-and-loss')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Profit & Loss statement' })
  getProfitAndLoss(@CurrentOrg() orgId: string, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.financialReportsService.getProfitAndLoss(orgId, startDate, endDate);
  }

  @Get('balance-sheet')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Balance Sheet' })
  getBalanceSheet(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate: string) {
    return this.financialReportsService.getBalanceSheet(orgId, asOfDate);
  }

  @Get('cash-flow')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Cash Flow Statement' })
  getCashFlow(@CurrentOrg() orgId: string, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.financialReportsService.getCashFlowStatement(orgId, startDate, endDate);
  }

  @Get('trial-balance')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Trial Balance' })
  getTrialBalance(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate: string) {
    return this.financialReportsService.getTrialBalance(orgId, asOfDate);
  }

  @Get('general-ledger/:accountId')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get General Ledger for account' })
  getGeneralLedger(
    @CurrentOrg() orgId: string,
    @Param('accountId') accountId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.financialReportsService.getGeneralLedger(orgId, accountId, startDate, endDate);
  }

  // Aging Reports
  @Get('receivables-aging')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Accounts Receivable Aging' })
  getReceivablesAging(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate?: string) {
    return this.agingReportsService.getReceivablesAging(orgId, asOfDate);
  }

  @Get('payables-aging')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Accounts Payable Aging' })
  getPayablesAging(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate?: string) {
    return this.agingReportsService.getPayablesAging(orgId, asOfDate);
  }

  @Get('customer-statement/:customerId')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Customer Statement' })
  getCustomerStatement(
    @CurrentOrg() orgId: string,
    @Param('customerId') customerId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.agingReportsService.getCustomerStatement(orgId, customerId, startDate, endDate);
  }

  @Get('vendor-statement/:vendorId')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get Vendor Statement' })
  getVendorStatement(
    @CurrentOrg() orgId: string,
    @Param('vendorId') vendorId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.agingReportsService.getVendorStatement(orgId, vendorId, startDate, endDate);
  }
}
