import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RouteOptimizationService } from '../services/route-optimization.service';
import {
  OptimizeRouteDto,
  OptimizedRouteDto,
  DeliveryEstimateDto,
  RouteAnalyticsDto,
} from '../dto/route-optimization.dto';

@ApiTags('AI - Route Optimization')
@ApiBearerAuth()
@Controller('ai/routes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RouteOptimizationController {
  constructor(private routeOptimizationService: RouteOptimizationService) {}

  @Post('optimize')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Optimize delivery route for a set of deliveries' })
  @ApiResponse({
    status: 200,
    description: 'Returns optimized route with estimated savings',
    type: OptimizedRouteDto,
  })
  async optimizeRoute(
    @CurrentOrg() orgId: string,
    @Body() body: OptimizeRouteDto,
  ) {
    const result = await this.routeOptimizationService.optimizeRoute(
      orgId,
      body.deliveryIds,
    );
    return { data: result };
  }

  @Get('estimate/:deliveryId')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Estimate delivery time for a specific delivery' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns delivery time estimate',
    type: DeliveryEstimateDto,
  })
  async estimateDelivery(
    @CurrentOrg() orgId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    const result = await this.routeOptimizationService.estimateDelivery(
      orgId,
      deliveryId,
    );
    return { data: result };
  }

  @Get('analytics')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get delivery route analytics and performance metrics' })
  @ApiResponse({
    status: 200,
    description: 'Returns route analytics data',
    type: RouteAnalyticsDto,
  })
  async getRouteAnalytics(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: RouteAnalyticsDto }> {
    const result = await this.routeOptimizationService.getRouteAnalytics(orgId);
    return { data: result };
  }
}
