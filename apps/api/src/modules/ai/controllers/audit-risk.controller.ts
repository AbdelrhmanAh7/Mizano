import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
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
import { AuditRiskService } from '../services/audit-risk.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/audit-risk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditRiskController {
  constructor(private auditRiskService: AuditRiskService) {}

  @Get(':entityType/:entityId')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get audit risk score for a specific entity' })
  @ApiParam({ name: 'entityType', enum: ['journal', 'invoice', 'bill', 'expense'] })
  @ApiParam({ name: 'entityId' })
  @ApiResponse({ status: 200, description: 'Returns risk score and factors' })
  scoreEntity(
    @CurrentOrg() orgId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditRiskService.scoreEntity(orgId, entityType, entityId);
  }

  @Get('high-risk')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get high-risk entities across all types' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Returns list of high-risk entities' })
  getHighRisk(@CurrentOrg() orgId: string, @Query('limit') limit?: number) {
    return this.auditRiskService.getHighRiskEntities(orgId, limit || 20);
  }

  @Post('batch/:entityType')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Batch score all entities of a type' })
  @ApiParam({ name: 'entityType', enum: ['journal', 'invoice', 'bill', 'expense'] })
  @ApiResponse({ status: 200, description: 'Batch scoring completed' })
  batchScore(@CurrentOrg() orgId: string, @Param('entityType') entityType: string) {
    return this.auditRiskService.batchScore(orgId, entityType);
  }
}
