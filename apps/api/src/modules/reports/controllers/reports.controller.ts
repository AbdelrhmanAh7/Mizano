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
    return this.dashboardService.getRevenueChart(orgId, months ? parseInt(months) : 12);
  }

  @Get('dashboard/cash-flow-chart')
  @Permissions('reports.view')
  @CacheResponse('dashboard:cash-flow-chart')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get cash flow chart data' })
  getCashFlowChart(@CurrentOrg() orgId: string, @Query('days') days?: string) {
    return this.dashboardService.getCashFlowChart(orgId, days ? parseInt(days) : 30);
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
    return this.dashboardService.getBankBalanceTrend(orgId, months ? parseInt(months) : 6);
  }

  @Get('dashboard/inventory-value-trend')
  @Permissions('reports.view')
  @CacheResponse('dashboard:inventory-value-trend')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get inventory value trend over time' })
  getInventoryValueTrend(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.dashboardService.getInventoryValueTrend(orgId, months ? parseInt(months) : 6);
  }

  // Financial Reports
  @Get('profit-and-loss')
  @Permissions('reports.view')
  @CacheResponse('reports:pnl')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get Profit & Loss statement' })
  getProfitAndLoss(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.financialReportsService.getProfitAndLoss(orgId, startDate, endDate);
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
  getCashFlow(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.financialReportsService.getCashFlowStatement(orgId, startDate, endDate);
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
