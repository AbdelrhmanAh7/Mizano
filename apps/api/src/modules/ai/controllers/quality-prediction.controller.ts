import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { QualityPredictionService } from '../services/quality-prediction.service';
import {
  WorkOrderQualityDto,
  BomQualityMetricsDto,
  QualityTrendDto,
} from '../dto/quality-prediction.dto';

@ApiTags('AI - Quality Prediction')
@ApiBearerAuth()
@Controller('ai/quality')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QualityPredictionController {
  constructor(private qualityPredictionService: QualityPredictionService) {}

  @Get('work-order/:workOrderId')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Predict quality outcomes for a specific work order' })
  @ApiParam({ name: 'workOrderId', description: 'Work Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns quality prediction for the work order',
    type: WorkOrderQualityDto,
  })
  async predictWorkOrderQuality(
    @CurrentOrg() orgId: string,
    @Param('workOrderId') workOrderId: string,
  ) {
    const result = await this.qualityPredictionService.predictWorkOrderQuality(orgId, workOrderId);
    return { data: result };
  }

  @Get('bom/:bomId/metrics')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get quality metrics for a specific Bill of Materials' })
  @ApiParam({ name: 'bomId', description: 'Bill of Materials ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns quality metrics for the BOM',
    type: BomQualityMetricsDto,
  })
  async getBomQualityMetrics(
    @CurrentOrg() orgId: string,
    @Param('bomId') bomId: string,
  ): Promise<{ data: BomQualityMetricsDto }> {
    const result = await this.qualityPredictionService.getBomQualityMetrics(orgId, bomId);
    return { data: result };
  }

  @Get('trends')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get quality trends over time' })
  @ApiResponse({
    status: 200,
    description: 'Returns monthly quality trend data',
    type: [QualityTrendDto],
  })
  async getQualityTrends(@CurrentOrg() orgId: string) {
    const result = await this.qualityPredictionService.getQualityTrends(orgId);
    return { data: result };
  }

  @Post('train')
  @Permissions('manufacturing.manage')
  @ApiOperation({ summary: 'Train the quality prediction model' })
  @ApiResponse({
    status: 200,
    description: 'Returns training results',
  })
  async trainModel(@CurrentOrg() orgId: string): Promise<{ data: unknown }> {
    const result = await this.qualityPredictionService.trainModel(orgId);
    return { data: result };
  }
}
