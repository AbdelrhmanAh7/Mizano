import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { FraudDetectionService } from '../services/fraud-detection.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/fraud')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FraudDetectionController {
  constructor(private fraudService: FraudDetectionService) {}

  @Get('score/:entityType/:entityId')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get fraud score for a specific entity' })
  @ApiParam({ name: 'entityType', enum: ['journal', 'bank_transaction', 'expense'] })
  @ApiParam({ name: 'entityId' })
  @ApiResponse({ status: 200, description: 'Returns fraud score and signals' })
  scoreEntity(
    @CurrentOrg() orgId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.fraudService.scoreTransaction(orgId, entityType, entityId);
  }

  @Get('alerts')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get unresolved fraud alerts' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Returns list of fraud alerts' })
  getAlerts(
    @CurrentOrg() orgId: string,
    @Query('limit') limit?: number,
  ) {
    return this.fraudService.getFraudAlerts(orgId, undefined, limit);
  }

  @Post('scan')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Run fraud scan on recent transactions' })
  @ApiResponse({ status: 200, description: 'Scan completed' })
  runScan(@CurrentOrg() orgId: string) {
    return this.fraudService.dailyFraudScan(orgId);
  }

  @Patch('alerts/:alertId/resolve')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Mark a fraud alert as resolved' })
  @ApiParam({ name: 'alertId' })
  @ApiResponse({ status: 200, description: 'Alert resolved' })
  resolveAlert(
    @CurrentOrg() orgId: string,
    @Param('alertId') alertId: string,
  ) {
    return this.fraudService.resolveAlert(orgId, alertId, false, 'system');
  }
}
