import {
  Controller,
  Get,
  Post,
  Param,
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
import { ReorderPointsService } from '../services/reorder-points.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/reorder')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReorderPointsController {
  constructor(private reorderService: ReorderPointsService) {}

  @Get('alerts')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get items needing reorder' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of items below reorder point',
  })
  getReorderAlerts(@CurrentOrg() orgId: string) {
    return this.reorderService.getReorderAlerts(orgId);
  }

  @Get('summary')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get reorder summary for dashboard' })
  getReorderSummary(@CurrentOrg() orgId: string) {
    return this.reorderService.getReorderSummary(orgId);
  }

  @Get('dead-stock')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get dead stock items' })
  @ApiQuery({
    name: 'thresholdDays',
    required: false,
    description: 'Days without sale to consider dead stock (default: 90)',
  })
  getDeadStock(
    @CurrentOrg() orgId: string,
    @Query('thresholdDays') thresholdDays?: number,
  ) {
    return this.reorderService.detectDeadStock(orgId, thresholdDays || 90);
  }

  @Get('item/:itemId')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get reorder analysis for a specific item' })
  @ApiQuery({
    name: 'leadTimeDays',
    required: false,
    description: 'Lead time in days (default: 7)',
  })
  @ApiQuery({
    name: 'serviceLevel',
    required: false,
    description: 'Service level 0-1 (default: 0.95)',
  })
  getItemReorderAnalysis(
    @CurrentOrg() orgId: string,
    @Param('itemId') itemId: string,
    @Query('leadTimeDays') leadTimeDays?: number,
    @Query('serviceLevel') serviceLevel?: number,
  ) {
    return this.reorderService.calculateForItem(
      orgId,
      itemId,
      leadTimeDays || 7,
      serviceLevel || 0.95,
    );
  }

  @Post('recalculate')
  @Permissions('inventory.manage')
  @ApiOperation({ summary: 'Recalculate reorder points for all items' })
  @ApiResponse({
    status: 200,
    description: 'Recalculation completed',
  })
  recalculateAll(@CurrentOrg() orgId: string) {
    return this.reorderService.calculateForAllItems(orgId);
  }

  @Post('update')
  @Permissions('inventory.manage')
  @ApiOperation({ summary: 'Update item reorder points in database' })
  @ApiResponse({
    status: 200,
    description: 'Reorder points updated',
  })
  updateReorderPoints(@CurrentOrg() orgId: string) {
    return this.reorderService.updateItemReorderPoints(orgId);
  }
}
