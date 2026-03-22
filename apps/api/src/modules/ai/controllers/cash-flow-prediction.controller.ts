import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CashFlowPredictionService } from '../services/cash-flow-prediction.service';
import {
  ForecastQueryDto,
  WhatIfScenarioDto,
  CashFlowPredictionResponse,
  QuickForecastResponse,
  ScenariosResponse,
  CashFlowAlertResponse,
  WhatIfResultResponse,
  RecalculateResultResponse,
} from '../dto/cash-flow-prediction.dto';

@ApiTags('AI - Cash Flow Prediction')
@ApiBearerAuth()
@Controller('ai/cash-flow')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashFlowPredictionController {
  constructor(private cashFlowPredictionService: CashFlowPredictionService) {}

  @Get('forecast')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get cash flow forecast with Monte Carlo simulation' })
  @ApiQuery({
    name: 'horizon',
    description: 'Forecast horizon in days (7-365)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns cash flow prediction',
    type: CashFlowPredictionResponse,
  })
  async getForecast(
    @CurrentOrg() orgId: string,
    @Query() query: ForecastQueryDto,
  ): Promise<{ data: CashFlowPredictionResponse }> {
    const forecast = await this.cashFlowPredictionService.predict(orgId, query.horizon || 90);
    return { data: forecast };
  }

  @Get('quick')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get quick cash flow summary' })
  @ApiResponse({
    status: 200,
    description: 'Returns quick forecast summary',
    type: QuickForecastResponse,
  })
  async getQuickForecast(@CurrentOrg() orgId: string): Promise<{ data: QuickForecastResponse }> {
    const forecast = await this.cashFlowPredictionService.getQuickForecast(orgId);
    return { data: forecast };
  }

  @Get('scenarios')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get optimistic, expected, and pessimistic scenarios' })
  @ApiResponse({
    status: 200,
    description: 'Returns three scenario forecasts',
    type: ScenariosResponse,
  })
  async getScenarios(@CurrentOrg() orgId: string): Promise<{ data: ScenariosResponse }> {
    const scenarios = await this.cashFlowPredictionService.getScenarios(orgId);
    return { data: scenarios };
  }

  @Get('alerts')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get cash flow alerts and warnings' })
  @ApiResponse({
    status: 200,
    description: 'Returns cash flow alerts',
    type: [CashFlowAlertResponse],
  })
  async getAlerts(@CurrentOrg() orgId: string): Promise<{ data: CashFlowAlertResponse[] }> {
    const alerts = await this.cashFlowPredictionService.getAlerts(orgId);
    return { data: alerts };
  }

  @Post('what-if')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Run what-if scenario analysis' })
  @ApiResponse({
    status: 200,
    description: 'Returns what-if analysis results',
    type: WhatIfResultResponse,
  })
  async whatIf(
    @CurrentOrg() orgId: string,
    @Body() scenario: WhatIfScenarioDto,
  ): Promise<{ data: WhatIfResultResponse }> {
    const result = await this.cashFlowPredictionService.whatIf(orgId, {
      type: scenario.type,
      params: {
        customerId: scenario.customerId,
        delayDays: scenario.delayDays,
        billId: scenario.billId,
        expenseAmount: scenario.expenseAmount,
        expenseDate: scenario.expenseDate,
        revenueChange: scenario.revenueChange,
      },
    });
    return { data: result };
  }

  @Post('recalculate')
  @Permissions('reports.manage')
  @ApiOperation({ summary: 'Recalculate cash flow forecasts' })
  @ApiResponse({
    status: 200,
    description: 'Returns recalculation result',
    type: RecalculateResultResponse,
  })
  async recalculate(@CurrentOrg() orgId: string): Promise<{ data: RecalculateResultResponse }> {
    const result = await this.cashFlowPredictionService.dailyRecalculate(orgId);
    return { data: result };
  }
}
