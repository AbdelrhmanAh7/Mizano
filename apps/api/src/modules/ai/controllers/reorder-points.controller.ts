import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ParseFloatPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
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
  async getReorderSummary(@CurrentOrg() orgId: string) {
    const summary = await this.reorderService.getReorderSummary(orgId);
    return { data: summary };
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
    @Query('thresholdDays', new DefaultValuePipe(90), ParseIntPipe) thresholdDays: number,
  ) {
    return this.reorderService.detectDeadStock(orgId, thresholdDays);
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
    @Query('leadTimeDays', new DefaultValuePipe(7), ParseIntPipe) leadTimeDays: number,
    @Query('serviceLevel', new DefaultValuePipe(0.95), ParseFloatPipe) serviceLevel: number,
  ) {
    return this.reorderService.calculateForItem(orgId, itemId, leadTimeDays, serviceLevel);
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

  @Get('abc-analysis')
  @Permissions('inventory.view')
  @ApiOperation({
    summary: 'Perform ABC analysis on inventory items',
    description:
      'Classifies items into A (top 80% value), B (next 15%), C (remaining 5%) with service level recommendations',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns ABC classification for all items',
  })
  getAbcAnalysis(@CurrentOrg() orgId: string) {
    return this.reorderService.performAbcAnalysis(orgId);
  }

  @Post('abc-recalculate')
  @Permissions('inventory.manage')
  @ApiOperation({
    summary: 'Recalculate reorder points using ABC-based service levels',
    description: 'Uses ABC classification to apply different service levels: A=98%, B=95%, C=90%',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns count of updated items by category',
  })
  recalculateWithAbc(@CurrentOrg() orgId: string) {
    return this.reorderService.recalculateWithAbcServiceLevels(orgId);
  }
}
