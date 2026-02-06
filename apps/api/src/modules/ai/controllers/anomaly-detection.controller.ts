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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { AnomalyQueryDto } from '../dto/anomaly-query.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/anomalies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnomalyDetectionController {
  constructor(private anomalyService: AnomalyDetectionService) {}

  @Get()
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get anomalies list' })
  @ApiResponse({ status: 200, description: 'Returns list of anomalies' })
  getAnomalies(@CurrentOrg() orgId: string, @Query() query: AnomalyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.anomalyService.getUnresolvedAnomalies(orgId, {
      type: query.type,
      severity: query.severity,
      limit,
      offset: (page - 1) * limit,
    });
  }

  @Get('stats')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get anomaly statistics' })
  getAnomalyStats(@CurrentOrg() orgId: string) {
    return this.anomalyService.getAnomalyStats(orgId);
  }

  @Post('scan')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Run manual anomaly scan' })
  @ApiResponse({
    status: 200,
    description: 'Scan completed, returns new anomalies found',
  })
  runAnomalyScan(@CurrentOrg() orgId: string) {
    return this.anomalyService.dailyAnomalyScan(orgId);
  }

  @Post(':id/resolve')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Resolve an anomaly' })
  @ApiResponse({ status: 200, description: 'Anomaly resolved' })
  resolveAnomaly(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.anomalyService.resolveAnomaly(orgId, id, user.id);
  }

  @Post('check/transaction')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Check if a transaction amount is anomalous' })
  checkTransactionAnomaly(
    @CurrentOrg() orgId: string,
    @Query('amount') amount: number,
    @Query('accountId') accountId: string,
  ) {
    return this.anomalyService.checkTransactionAnomaly(orgId, amount, accountId);
  }

  @Post('check/spending')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Check if spending is anomalous for a vendor' })
  checkSpendingAnomaly(
    @CurrentOrg() orgId: string,
    @Query('vendorId') vendorId: string,
    @Query('amount') amount: number,
  ) {
    return this.anomalyService.checkSpendingAnomaly(orgId, vendorId, amount);
  }
}
