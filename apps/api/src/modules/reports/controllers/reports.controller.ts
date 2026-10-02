import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CacheResponse, CacheTTL, CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PdfService } from '../../documents/services/pdf.service';
import { AgingReportsService } from '../services/aging-reports.service';
import { DashboardService } from '../services/dashboard.service';
import { FinancialReportsService } from '../services/financial-reports.service';
import { FinancialNarrativeService } from '../../ai/services/financial-narrative.service';
import { MAX_DAYS, MAX_MONTHS, clampInt } from '../utils/report-utils';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly financialReportsService: FinancialReportsService,
    private readonly agingReportsService: AgingReportsService,
    private readonly dashboardService: DashboardService,
    private readonly pdfService: PdfService,
    private readonly narrativeService: FinancialNarrativeService,
  ) {}

  // Dashboard
  @Get('dashboard')
  @Permissions('reports.view')
  @CacheResponse('dashboard:overview')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get dashboard overview' })
  getDashboard(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.dashboardService.getDashboardOverview(orgId, startDate, endDate);
  }

  @Get('dashboard/revenue-chart')
  @Permissions('reports.view')
  @CacheResponse('dashboard:revenue-chart')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get revenue chart data' })
  getRevenueChart(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getRevenueChart(orgId, clampInt(months, 12, 1, MAX_MONTHS));
  }

  @Get('dashboard/cash-flow-chart')
  @Permissions('reports.view')
  @CacheResponse('dashboard:cash-flow-chart')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get cash flow chart data' })
  getCashFlowChart(@CurrentOrg() orgId: string, @Query('days') days?: string) {
    return this.dashboardService.getCashFlowChart(orgId, clampInt(days, 30, 1, MAX_DAYS));
  }

  @Get('dashboard/top-customers')
  @Permissions('reports.view')
  @CacheResponse('dashboard:top-customers')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get top customers by revenue' })
  getTopCustomers(@CurrentOrg() orgId: string, @Query('limit') limit?: string) {
    return this.dashboardService.getTopCustomers(orgId, limit ? parseInt(limit) : 5);
  }

  @Get('dashboard/expenses-by-category')
  @Permissions('reports.view')
  @CacheResponse('dashboard:expenses-by-category')
  @CacheTTL(300)
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
  @CacheResponse('dashboard:projects')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get projects overview' })
  getProjectsOverview(@CurrentOrg() orgId: string) {
    return this.dashboardService.getProjectsOverview(orgId);
  }

  @Get('dashboard/bank-balance-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:bank-balance-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get bank balance trend over time' })
  getBankBalanceTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getBankBalanceTrend(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/inventory-value-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:inventory-value-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get inventory value trend over time' })
  getInventoryValueTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getInventoryValueTrend(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  // ============ Financial (Tab 2) ============

  @Get('dashboard/gross-margin-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:gross-margin-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get gross margin trend' })
  getGrossMarginTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getGrossMarginTrend(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/revenue-yoy')
  @Permissions('reports.view')
  @CacheResponse('dashboard:revenue-yoy')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get year-over-year revenue comparison' })
  getRevenueYoY(@CurrentOrg() orgId: string) {
    return this.dashboardService.getRevenueYoY(orgId);
  }

  @Get('dashboard/account-balances')
  @Permissions('reports.view')
  @CacheResponse('dashboard:account-balances')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get account balances by type' })
  getAccountBalances(@CurrentOrg() orgId: string) {
    return this.dashboardService.getAccountBalances(orgId);
  }

  @Get('dashboard/vat-summary')
  @Permissions('reports.view')
  @CacheResponse('dashboard:vat-summary')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get VAT returns summary' })
  getVATSummary(@CurrentOrg() orgId: string) {
    return this.dashboardService.getVATSummary(orgId);
  }

  // ============ Sales (Tab 3) ============

  @Get('dashboard/invoice-status')
  @Permissions('reports.view')
  @CacheResponse('dashboard:invoice-status')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get invoice count by status' })
  getInvoiceStatus(@CurrentOrg() orgId: string) {
    return this.dashboardService.getInvoiceStatus(orgId);
  }

  @Get('dashboard/quote-conversion')
  @Permissions('reports.view')
  @CacheResponse('dashboard:quote-conversion')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get quote conversion funnel' })
  getQuoteConversion(@CurrentOrg() orgId: string) {
    return this.dashboardService.getQuoteConversion(orgId);
  }

  @Get('dashboard/invoice-volume')
  @Permissions('reports.view')
  @CacheResponse('dashboard:invoice-volume')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly invoice volume and amount' })
  getInvoiceVolume(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getInvoiceVolume(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/payment-collection')
  @Permissions('reports.view')
  @CacheResponse('dashboard:payment-collection')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly payment collection amounts' })
  getPaymentCollection(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getPaymentCollection(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/churn-risk')
  @Permissions('reports.view')
  @CacheResponse('dashboard:churn-risk')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get customer churn risk distribution' })
  getChurnRisk(@CurrentOrg() orgId: string) {
    return this.dashboardService.getChurnRisk(orgId);
  }

  @Get('dashboard/clv-segments')
  @Permissions('reports.view')
  @CacheResponse('dashboard:clv-segments')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get customer lifetime value segments' })
  getCLVSegments(@CurrentOrg() orgId: string) {
    return this.dashboardService.getCLVSegments(orgId);
  }

  // ============ Purchases (Tab 4) ============

  @Get('dashboard/bill-status')
  @Permissions('reports.view')
  @CacheResponse('dashboard:bill-status')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get bill count by status' })
  getBillStatus(@CurrentOrg() orgId: string) {
    return this.dashboardService.getBillStatus(orgId);
  }

  @Get('dashboard/top-vendors')
  @Permissions('reports.view')
  @CacheResponse('dashboard:top-vendors')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get top vendors by spend' })
  getTopVendors(@CurrentOrg() orgId: string, @Query('limit') limit?: string) {
    return this.dashboardService.getTopVendors(orgId, limit ? parseInt(limit) : 5);
  }

  @Get('dashboard/purchase-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:purchase-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly purchase trend' })
  getPurchaseTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getPurchaseTrend(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/expense-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:expense-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly expense trend with categories' })
  getExpenseTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getExpenseTrend(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/vendor-payment-time')
  @Permissions('reports.view')
  @CacheResponse('dashboard:vendor-payment-time')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get average vendor payment time' })
  getVendorPaymentTime(@CurrentOrg() orgId: string, @Query('limit') limit?: string) {
    return this.dashboardService.getVendorPaymentTime(orgId, limit ? parseInt(limit) : 10);
  }

  // ============ HR (Tab 5) ============

  @Get('dashboard/payroll-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:payroll-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly payroll trend' })
  getPayrollTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getPayrollTrend(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/department-headcount')
  @Permissions('reports.view')
  @CacheResponse('dashboard:department-headcount')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get employee count by department' })
  getDepartmentHeadcount(@CurrentOrg() orgId: string) {
    return this.dashboardService.getDepartmentHeadcount(orgId);
  }

  @Get('dashboard/attendance-overview')
  @Permissions('reports.view')
  @CacheResponse('dashboard:attendance-overview')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get attendance status overview' })
  getAttendanceOverview(@CurrentOrg() orgId: string, @Query('days') days?: string) {
    return this.dashboardService.getAttendanceOverview(orgId, clampInt(days, 30, 1, MAX_DAYS));
  }

  @Get('dashboard/salary-distribution')
  @Permissions('reports.view')
  @CacheResponse('dashboard:salary-distribution')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get salary range distribution' })
  getSalaryDistribution(@CurrentOrg() orgId: string) {
    return this.dashboardService.getSalaryDistribution(orgId);
  }

  @Get('dashboard/attrition-risk')
  @Permissions('reports.view')
  @CacheResponse('dashboard:attrition-risk')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get employee attrition risk distribution' })
  getAttritionRisk(@CurrentOrg() orgId: string) {
    return this.dashboardService.getAttritionRisk(orgId);
  }

  // ============ Inventory (Tab 6) ============

  @Get('dashboard/stock-levels')
  @Permissions('reports.view')
  @CacheResponse('dashboard:stock-levels')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get current stock levels' })
  getStockLevels(@CurrentOrg() orgId: string, @Query('limit') limit?: string) {
    return this.dashboardService.getStockLevels(orgId, limit ? parseInt(limit) : 15);
  }

  @Get('dashboard/inventory-movements')
  @Permissions('reports.view')
  @CacheResponse('dashboard:inventory-movements')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly inventory movements' })
  getInventoryMovements(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getInventoryMovements(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/reorder-alerts')
  @Permissions('reports.view')
  @CacheResponse('dashboard:reorder-alerts')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get items needing reorder' })
  getReorderAlerts(@CurrentOrg() orgId: string) {
    return this.dashboardService.getReorderAlerts(orgId);
  }

  @Get('dashboard/work-order-status')
  @Permissions('reports.view')
  @CacheResponse('dashboard:work-order-status')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get work order count by status' })
  getWorkOrderStatus(@CurrentOrg() orgId: string) {
    return this.dashboardService.getWorkOrderStatus(orgId);
  }

  @Get('dashboard/production-efficiency')
  @Permissions('reports.view')
  @CacheResponse('dashboard:production-efficiency')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly production efficiency' })
  getProductionEfficiency(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getProductionEfficiency(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  // ============ Projects (Tab 7) ============

  @Get('dashboard/project-budgets')
  @Permissions('reports.view')
  @CacheResponse('dashboard:project-budgets')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get active project budgets vs actual' })
  getProjectBudgets(@CurrentOrg() orgId: string) {
    return this.dashboardService.getProjectBudgets(orgId);
  }

  @Get('dashboard/billable-hours')
  @Permissions('reports.view')
  @CacheResponse('dashboard:billable-hours')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly billable vs non-billable hours' })
  getBillableHours(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getBillableHours(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/task-status')
  @Permissions('reports.view')
  @CacheResponse('dashboard:task-status')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get task count by status for active projects' })
  getTaskStatus(@CurrentOrg() orgId: string) {
    return this.dashboardService.getTaskStatus(orgId);
  }

  @Get('dashboard/project-profitability')
  @Permissions('reports.view')
  @CacheResponse('dashboard:project-profitability')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get project profitability analysis' })
  getProjectProfitability(@CurrentOrg() orgId: string) {
    return this.dashboardService.getProjectProfitability(orgId);
  }

  // ============ CRM (Tab 8) ============

  @Get('dashboard/deal-pipeline')
  @Permissions('reports.view')
  @CacheResponse('dashboard:deal-pipeline')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get deal pipeline by stage' })
  getDealPipeline(@CurrentOrg() orgId: string) {
    return this.dashboardService.getDealPipeline(orgId);
  }

  @Get('dashboard/leads-by-source')
  @Permissions('reports.view')
  @CacheResponse('dashboard:leads-by-source')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get lead count by source' })
  getLeadsBySource(@CurrentOrg() orgId: string) {
    return this.dashboardService.getLeadsBySource(orgId);
  }

  @Get('dashboard/lead-conversion-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:lead-conversion-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly lead conversion count' })
  getLeadConversionTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getLeadConversionTrend(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  @Get('dashboard/deal-win-rate')
  @Permissions('reports.view')
  @CacheResponse('dashboard:deal-win-rate')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get monthly deal win rate' })
  getDealWinRate(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getDealWinRate(orgId, clampInt(months, 6, 1, MAX_MONTHS));
  }

  // ============ AI (Tab 9) ============

  @Get('dashboard/anomaly-timeline')
  @Permissions('reports.view')
  @CacheResponse('dashboard:anomaly-timeline')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get AI anomaly timeline' })
  getAnomalyTimeline(@CurrentOrg() orgId: string, @Query('days') days?: string) {
    return this.dashboardService.getAnomalyTimeline(orgId, clampInt(days, 90, 1, MAX_DAYS));
  }

  // Financial Reports
  @Get('profit-and-loss')
  @Permissions('reports.view')
  @CacheResponse('reports:pnl')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Profit & Loss statement' })
  async getProfitAndLoss(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('includeNarrative') includeNarrative?: string,
  ) {
    const report = await this.financialReportsService.getProfitAndLoss(orgId, startDate, endDate);

    if (includeNarrative === 'true') {
      const endDateObj = new Date(endDate);
      const narrative = await this.narrativeService.generateMonthlyNarrative(
        orgId,
        endDateObj.getMonth() + 1,
        endDateObj.getFullYear(),
      );
      return { ...report, narrative };
    }

    return report;
  }

  @Get('balance-sheet')
  @Permissions('reports.view')
  @CacheResponse('reports:balance-sheet')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Balance Sheet' })
  getBalanceSheet(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate: string) {
    return this.financialReportsService.getBalanceSheet(orgId, asOfDate);
  }

  @Get('cash-flow')
  @Permissions('reports.view')
  @CacheResponse('reports:cash-flow')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Cash Flow Statement' })
  async getCashFlow(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('includeNarrative') includeNarrative?: string,
  ) {
    const report = await this.financialReportsService.getCashFlowStatement(
      orgId,
      startDate,
      endDate,
    );

    if (includeNarrative === 'true') {
      const narrative = await this.narrativeService.generateCashFlowNarrative(orgId);
      return { ...report, narrative };
    }

    return report;
  }

  @Get('trial-balance')
  @Permissions('reports.view')
  @CacheResponse('reports:trial-balance')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Trial Balance' })
  getTrialBalance(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate: string) {
    return this.financialReportsService.getTrialBalance(orgId, asOfDate);
  }

  @Get('general-ledger/:accountId')
  @Permissions('reports.view')
  @CacheResponse('reports:general-ledger')
  @CacheTTL(600)
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
  @CacheResponse('reports:receivables-aging')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Accounts Receivable Aging' })
  getReceivablesAging(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate?: string) {
    return this.agingReportsService.getReceivablesAging(orgId, asOfDate);
  }

  @Get('payables-aging')
  @Permissions('reports.view')
  @CacheResponse('reports:payables-aging')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Accounts Payable Aging' })
  getPayablesAging(@CurrentOrg() orgId: string, @Query('asOfDate') asOfDate?: string) {
    return this.agingReportsService.getPayablesAging(orgId, asOfDate);
  }

  @Get('customer-statement/:customerId')
  @Permissions('reports.view')
  @CacheResponse('reports:customer-statement')
  @CacheTTL(600)
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
  @CacheResponse('reports:vendor-statement')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Vendor Statement' })
  getVendorStatement(
    @CurrentOrg() orgId: string,
    @Param('vendorId') vendorId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.agingReportsService.getVendorStatement(orgId, vendorId, startDate, endDate);
  }

  // Sales & Purchases Reports
  @Get('sales-by-customer')
  @Permissions('reports.view')
  @CacheResponse('reports:sales-by-customer')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Sales by Customer report' })
  getSalesByCustomer(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.financialReportsService.getSalesByCustomer(orgId, startDate, endDate);
  }

  @Get('sales-by-item')
  @Permissions('reports.view')
  @CacheResponse('reports:sales-by-item')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Sales by Item report' })
  getSalesByItem(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.financialReportsService.getSalesByItem(orgId, startDate, endDate);
  }

  @Get('purchases-by-vendor')
  @Permissions('reports.view')
  @CacheResponse('reports:purchases-by-vendor')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Purchases by Vendor report' })
  getPurchasesByVendor(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.financialReportsService.getPurchasesByVendor(orgId, startDate, endDate);
  }

  // ============ PDF Export Endpoints ============

  @Get('profit-and-loss/pdf')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Download Profit & Loss as PDF' })
  async getProfitAndLossPdf(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateProfitAndLossPdf(orgId, startDate, endDate);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="profit-and-loss-${startDate}-${endDate}.pdf"`,
    });
    res.send(buffer);
  }

  @Get('balance-sheet/pdf')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Download Balance Sheet as PDF' })
  async getBalanceSheetPdf(
    @CurrentOrg() orgId: string,
    @Query('asOfDate') asOfDate: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateBalanceSheetPdf(orgId, asOfDate);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="balance-sheet-${asOfDate}.pdf"`,
    });
    res.send(buffer);
  }

  @Get('receivables-aging/pdf')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Download Receivables Aging as PDF' })
  async getReceivablesAgingPdf(
    @CurrentOrg() orgId: string,
    @Query('asOfDate') asOfDate: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateAgingReportPdf(orgId, 'receivables', asOfDate);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receivables-aging-${asOfDate || 'current'}.pdf"`,
    });
    res.send(buffer);
  }

  @Get('payables-aging/pdf')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Download Payables Aging as PDF' })
  async getPayablesAgingPdf(
    @CurrentOrg() orgId: string,
    @Query('asOfDate') asOfDate: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateAgingReportPdf(orgId, 'payables', asOfDate);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payables-aging-${asOfDate || 'current'}.pdf"`,
    });
    res.send(buffer);
  }
}
