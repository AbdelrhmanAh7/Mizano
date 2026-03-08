import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import {
  FinancialNarrativeService,
  GeneratedNarrative,
  QueryAnswer,
} from '../services/financial-narrative.service';
import {
  GeneratedNarrativeResponse,
  QueryTemplateResponse,
  QueryResultResponse,
} from '../dto/narrative.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/narrative')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NarrativeController {
  constructor(private narrativeService: FinancialNarrativeService) {}

  @Get('monthly')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Generate monthly financial narrative' })
  @ApiQuery({ name: 'month', description: 'Month (1-12)', required: false })
  @ApiQuery({ name: 'year', description: 'Year (e.g., 2024)', required: false })
  @ApiResponse({
    status: 200,
    description: 'Returns monthly financial narrative',
    type: GeneratedNarrativeResponse,
  })
  async getMonthlyNarrative(
    @CurrentOrg() orgId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ): Promise<{ data: GeneratedNarrative }> {
    const now = new Date();
    const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();

    const narrative = await this.narrativeService.generateMonthlyNarrative(
      orgId,
      targetMonth,
      targetYear,
    );
    return { data: narrative };
  }

  @Get('weekly')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Generate weekly financial snapshot' })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date of the week (ISO format)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns weekly financial snapshot',
    type: GeneratedNarrativeResponse,
  })
  async getWeeklySnapshot(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate?: string,
  ): Promise<{ data: GeneratedNarrative }> {
    const targetDate = startDate ? new Date(startDate) : undefined;
    const narrative = await this.narrativeService.generateWeeklySnapshot(orgId, targetDate);
    return { data: narrative };
  }

  @Get('customer/:id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Generate customer health narrative' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns customer narrative',
    type: GeneratedNarrativeResponse,
  })
  async getCustomerNarrative(
    @CurrentOrg() orgId: string,
    @Param('id') customerId: string,
  ): Promise<{ data: GeneratedNarrative }> {
    const narrative = await this.narrativeService.generateCustomerNarrative(orgId, customerId);
    return { data: narrative };
  }

  @Get('item/:id')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Generate item/product performance narrative' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns item performance narrative',
    type: GeneratedNarrativeResponse,
  })
  async getItemNarrative(
    @CurrentOrg() orgId: string,
    @Param('id') itemId: string,
  ): Promise<{ data: GeneratedNarrative }> {
    const narrative = await this.narrativeService.generateItemNarrative(orgId, itemId);
    return { data: narrative };
  }

  @Get('cash-flow')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Generate cash flow narrative with forecast' })
  @ApiResponse({
    status: 200,
    description: 'Returns cash flow narrative',
    type: GeneratedNarrativeResponse,
  })
  async getCashFlowNarrative(@CurrentOrg() orgId: string): Promise<{ data: GeneratedNarrative }> {
    const narrative = await this.narrativeService.generateCashFlowNarrative(orgId);
    return { data: narrative };
  }

  @Get('queries')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get list of available "Ask Your Data" queries' })
  @ApiResponse({
    status: 200,
    description: 'Returns available query templates',
    type: [QueryTemplateResponse],
  })
  async getAvailableQueries(): Promise<{ data: QueryTemplateResponse[] }> {
    const queries = this.narrativeService.getAvailableQueries();
    return { data: queries as unknown as QueryTemplateResponse[] };
  }

  @Get('query/:id')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Execute a structured query ("Ask Your Data")' })
  @ApiParam({ name: 'id', description: 'Query template ID' })
  @ApiQuery({
    name: 'period',
    description: 'Date period (e.g., this-month, last-month, this-quarter)',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Limit results (default varies by query)',
    required: false,
  })
  @ApiQuery({
    name: 'minAmount',
    description: 'Minimum amount filter',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns query result with natural language answer',
    type: QueryResultResponse,
  })
  async executeQuery(
    @CurrentOrg() orgId: string,
    @Param('id') queryId: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('minAmount') minAmount?: string,
  ): Promise<{ data: QueryAnswer }> {
    const params: Record<string, unknown> = {};
    if (period) params.period = period;
    if (limit) params.limit = parseInt(limit, 10);
    if (minAmount) params.minAmount = parseFloat(minAmount);

    const result = await this.narrativeService.answerQuery(orgId, queryId, params);
    return { data: result };
  }
}
