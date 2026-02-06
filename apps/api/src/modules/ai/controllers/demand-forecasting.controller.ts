import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { DemandForecastingService } from '../services/demand-forecasting.service';
import {
  ForecastParamsDto,
  HolidayConfigDto,
  DemandForecastResponse,
  SeasonalityResponse,
  TrendResponse,
  ForecastDashboardResponse,
  RecalculateResponse,
} from '../dto/demand-forecast.dto';

@ApiTags('AI - Demand Forecasting')
@ApiBearerAuth()
@Controller('ai/demand-forecast')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DemandForecastingController {
  constructor(private demandForecastingService: DemandForecastingService) {}

  @Get('item/:id')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get demand forecast for an item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiQuery({
    name: 'horizon',
    description: 'Forecast horizon in months (1-24)',
    required: false,
  })
  @ApiQuery({
    name: 'alpha',
    description: 'Level smoothing (0-1)',
    required: false,
  })
  @ApiQuery({
    name: 'beta',
    description: 'Trend smoothing (0-1)',
    required: false,
  })
  @ApiQuery({
    name: 'gamma',
    description: 'Seasonal smoothing (0-1)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns demand forecast',
    type: DemandForecastResponse,
  })
  async forecastItem(
    @CurrentOrg() orgId: string,
    @Param('id') itemId: string,
    @Query() params: ForecastParamsDto,
  ): Promise<{ data: DemandForecastResponse }> {
    const forecast = await this.demandForecastingService.forecastItem(
      orgId,
      itemId,
      params.horizon || 6,
      {
        alpha: params.alpha,
        beta: params.beta,
        gamma: params.gamma,
        seasonLength: params.seasonLength,
      },
    );
    return { data: forecast };
  }

  @Get('item/:id/seasonality')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get seasonality pattern for an item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns seasonality analysis',
    type: SeasonalityResponse,
  })
  async getSeasonality(
    @CurrentOrg() orgId: string,
    @Param('id') itemId: string,
  ): Promise<{ data: SeasonalityResponse }> {
    const seasonality = await this.demandForecastingService.getSeasonalityPattern(
      orgId,
      itemId,
    );
    return { data: seasonality };
  }

  @Get('item/:id/trend')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get trend analysis for an item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns trend analysis',
    type: TrendResponse,
  })
  async getTrend(
    @CurrentOrg() orgId: string,
    @Param('id') itemId: string,
  ): Promise<{ data: TrendResponse }> {
    const trend = await this.demandForecastingService.detectItemTrend(
      orgId,
      itemId,
    );
    return { data: trend };
  }

  @Get('dashboard')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get forecast dashboard summary' })
  @ApiResponse({
    status: 200,
    description: 'Returns forecast dashboard data',
    type: ForecastDashboardResponse,
  })
  async getDashboard(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: ForecastDashboardResponse }> {
    const dashboard = await this.demandForecastingService.getForecastDashboard(
      orgId,
    );
    return { data: dashboard };
  }

  @Post('recalculate')
  @Permissions('inventory.manage')
  @ApiOperation({ summary: 'Recalculate forecasts for all items' })
  @ApiResponse({
    status: 200,
    description: 'Returns recalculation results',
    type: RecalculateResponse,
  })
  async recalculate(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: RecalculateResponse }> {
    const result = await this.demandForecastingService.forecastAllItems(orgId);
    return { data: result };
  }

  @Post('item/:id/apply-holidays')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Apply holiday multipliers to forecast' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns adjusted forecast',
    type: DemandForecastResponse,
  })
  async applyHolidays(
    @CurrentOrg() orgId: string,
    @Param('id') itemId: string,
    @Body() config: HolidayConfigDto,
  ): Promise<{ data: DemandForecastResponse }> {
    // First get the base forecast
    const forecast = await this.demandForecastingService.forecastItem(
      orgId,
      itemId,
    );

    // Apply holiday config
    const adjustedForecast = await this.demandForecastingService.applyHolidayConfig(
      forecast,
      {
        ramadan: { enabled: false, multiplier: 1, categories: [], ...config.ramadan },
        eid: { enabled: false, multiplier: 1, ...config.eid },
        customHolidays: (config.customHolidays || []).map(h => ({ ...h, categories: h.categories || [] })),
      },
    );

    return { data: adjustedForecast };
  }
}
