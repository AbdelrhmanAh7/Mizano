import {
  Controller,
  Get,
  Post,
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
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ComplianceMonitoringService } from '../services/compliance-monitoring.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/compliance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplianceMonitoringController {
  constructor(private complianceService: ComplianceMonitoringService) {}

  @Get('report')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get full compliance report' })
  @ApiResponse({ status: 200, description: 'Returns compliance report with violations' })
  getReport(@CurrentOrg() orgId: string) {
    return this.complianceService.runComplianceCheck(orgId);
  }

  @Get('score')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get compliance score by category' })
  @ApiResponse({ status: 200, description: 'Returns overall and category scores' })
  getScore(@CurrentOrg() orgId: string) {
    return this.complianceService.getComplianceScore(orgId);
  }

  @Post('check')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Run compliance check and store results' })
  @ApiResponse({ status: 200, description: 'Compliance check completed' })
  runCheck(@CurrentOrg() orgId: string) {
    return this.complianceService.runComplianceCheck(orgId);
  }
}
