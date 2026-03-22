import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PredictiveMaintenanceService } from '../services/predictive-maintenance.service';
import {
  AssetHealthDto,
  MaintenanceScheduleItemDto,
  MaintenanceBatchDto,
} from '../dto/predictive-maintenance.dto';

@ApiTags('AI - Predictive Maintenance')
@ApiBearerAuth()
@Controller('ai/maintenance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PredictiveMaintenanceController {
  constructor(private predictiveMaintenanceService: PredictiveMaintenanceService) {}

  @Get('asset/:assetId')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Predict health and maintenance needs for a specific asset' })
  @ApiParam({ name: 'assetId', description: 'Asset ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns health prediction for the asset',
    type: AssetHealthDto,
  })
  async predictAssetHealth(@CurrentOrg() orgId: string, @Param('assetId') assetId: string) {
    const result = await this.predictiveMaintenanceService.predictAssetHealth(orgId, assetId);
    return { data: result };
  }

  @Get('schedule')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get recommended maintenance schedule for all assets' })
  @ApiResponse({
    status: 200,
    description: 'Returns prioritized maintenance schedule',
    type: [MaintenanceScheduleItemDto],
  })
  async getMaintenanceSchedule(@CurrentOrg() orgId: string) {
    const result = await this.predictiveMaintenanceService.getMaintenanceSchedule(orgId);
    return { data: result };
  }

  @Get('health-scores')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get health scores for all assets' })
  @ApiResponse({
    status: 200,
    description: 'Returns health scores for all tracked assets',
    type: [AssetHealthDto],
  })
  async getHealthScores(@CurrentOrg() orgId: string) {
    const result = await this.predictiveMaintenanceService.getHealthScores(orgId);
    return { data: result };
  }

  @Post('predict-all')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Batch predict maintenance needs for all assets' })
  @ApiResponse({
    status: 200,
    description: 'Returns batch prediction summary',
    type: MaintenanceBatchDto,
  })
  async predictAll(@CurrentOrg() orgId: string): Promise<{ data: MaintenanceBatchDto }> {
    const result = await this.predictiveMaintenanceService.predictAll(orgId);
    return { data: result };
  }
}
