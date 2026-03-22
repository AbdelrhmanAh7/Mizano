import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AiCategorizationService } from '../services/ai-categorization.service';
import { AiForecastingService } from '../services/ai-forecasting.service';
import { AiInsightsService } from '../services/ai-insights.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiController {
  constructor(
    private readonly aiInsightsService: AiInsightsService,
    private readonly aiForecastingService: AiForecastingService,
    private readonly aiCategorizationService: AiCategorizationService,
  ) {}

  // Insights
  @Get('insights')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get AI-generated business insights with optional filters' })
  getInsights(
    @CurrentOrg() orgId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.aiInsightsService.getInsights(orgId, {
      type,
      status,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('insights/:id')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get a specific insight by ID' })
  getInsight(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.aiInsightsService.getInsightById(orgId, id);
  }

  @Post('insights/:id/dismiss')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Dismiss an insight' })
  dismissInsight(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.aiInsightsService.dismissInsight(orgId, id);
  }

  @Post('insights/:id/action')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Record an action taken on an insight' })
  actionInsight(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { action: string },
  ) {
    return this.aiInsightsService.actionInsight(orgId, id, dto.action);
  }

  // Forecasting
  @Get('forecast/revenue')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get revenue forecast' })
  forecastRevenue(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.aiForecastingService.forecastRevenue(orgId, months ? parseInt(months) : 3);
  }

  @Get('forecast/cash-flow')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get cash flow forecast' })
  forecastCashFlow(@CurrentOrg() orgId: string, @Query('weeks') weeks?: string) {
    return this.aiForecastingService.forecastCashFlow(orgId, weeks ? parseInt(weeks) : 4);
  }

  @Get('forecast/expenses')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get expenses forecast' })
  forecastExpenses(@CurrentOrg() orgId: string, @Query('months') months?: string) {
    return this.aiForecastingService.forecastExpenses(orgId, months ? parseInt(months) : 3);
  }

  @Get('forecast/customer-churn')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Predict customer churn risk' })
  predictChurn(@CurrentOrg() orgId: string) {
    return this.aiForecastingService.predictCustomerChurn(orgId);
  }

  // Categorization
  @Post('categorize')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Categorize a transaction' })
  categorize(
    @CurrentOrg() orgId: string,
    @Body() dto: { description: string; amount: number; type: 'expense' | 'income' },
  ) {
    return this.aiCategorizationService.categorizeTransaction(
      orgId,
      dto.description,
      dto.amount,
      dto.type,
    );
  }

  @Post('categorize/learn')
  @Permissions('banking.edit')
  @ApiOperation({ summary: 'Learn from user categorization' })
  learn(
    @CurrentOrg() orgId: string,
    @Body() dto: { description: string; accountId: string; type: 'expense' | 'income' },
  ) {
    return this.aiCategorizationService.learnFromCategorization(
      orgId,
      dto.description,
      dto.accountId,
      dto.type,
    );
  }

  @Get('categorize/bank-transactions')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Auto-categorize bank transactions' })
  autoCategorize(@CurrentOrg() orgId: string, @Query('bankAccountId') bankAccountId: string) {
    return this.aiCategorizationService.autoCategorizeBankTransactions(orgId, bankAccountId);
  }

  @Get('categorize/stats')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get categorization statistics' })
  getStats(@CurrentOrg() orgId: string) {
    return this.aiCategorizationService.getCategorizationStats(orgId);
  }

  @Post('suggest-vendor')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Suggest vendor from description' })
  suggestVendor(@CurrentOrg() orgId: string, @Body() dto: { description: string }) {
    return this.aiCategorizationService.suggestVendorFromDescription(orgId, dto.description);
  }
}
