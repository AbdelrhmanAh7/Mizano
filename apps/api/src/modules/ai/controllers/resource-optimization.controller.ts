import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ResourceOptimizationService } from '../services/resource-optimization.service';
import {
  ResourceTrendDto,
  ResourceForecastDto,
  OptimizationOpportunityDto,
  EfficiencyMetricsDto,
} from '../dto/resource-optimization.dto';

@ApiTags('AI - Resource Optimization')
@ApiBearerAuth()
@Controller('ai/resources')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ResourceOptimizationController {
  constructor(private resourceOptimizationService: ResourceOptimizationService) {}

  @Get('trends')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get resource utilization trends over time' })
  @ApiQuery({
    name: 'months',
    description: 'Number of months of historical data to return',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns resource trends by category',
    type: [ResourceTrendDto],
  })
  async getResourceTrends(
    @CurrentOrg() orgId: string,
    @Query('months') months?: string,
  ) {
    const result = await this.resourceOptimizationService.getResourceTrends(
      orgId,
      months ? parseInt(months, 10) : 12,
    );
    return { data: result };
  }

  @Get('forecast')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Forecast future resource needs based on historical data' })
  @ApiQuery({
    name: 'forecastMonths',
    description: 'Number of months to forecast into the future',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns historical and forecasted resource data',
    type: ResourceForecastDto,
  })
  async forecastResources(
    @CurrentOrg() orgId: string,
    @Query('forecastMonths') forecastMonths?: string,
  ) {
    const result = await this.resourceOptimizationService.forecastResources(
      orgId,
      forecastMonths ? parseInt(forecastMonths, 10) : 6,
    );
    return { data: result };
  }

  @Get('opportunities')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Identify cost optimization opportunities' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of optimization opportunities with potential savings',
    type: [OptimizationOpportunityDto],
  })
  async getOptimizationOpportunities(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.resourceOptimizationService.getOptimizationOpportunities(orgId);
    return { data: result };
  }

  @Get('efficiency')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get overall efficiency metrics for the organization' })
  @ApiResponse({
    status: 200,
    description: 'Returns efficiency metrics including revenue ratios and trends',
    type: EfficiencyMetricsDto,
  })
  async getEfficiencyMetrics(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.resourceOptimizationService.getEfficiencyMetrics(orgId);
    return { data: result };
  }
}
