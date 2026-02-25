import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { CurrentOrg, Permissions } from '../../common/decorators';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Get all audit logs with filtering and pagination' })
  @Permissions('settings.view')
  findAll(@CurrentOrg() organizationId: string, @Query() query: AuditQueryDto) {
    return this.auditService.findAll(organizationId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get audit log statistics' })
  @Permissions('settings.view')
  getStats(@CurrentOrg() organizationId: string, @Query('days') days?: number) {
    return this.auditService.getStats(organizationId, days ? Number(days) : 30);
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Get audit logs for a specific entity' })
  @ApiParam({ name: 'entityType', description: 'Entity type (e.g., customers, invoices)' })
  @ApiParam({ name: 'entityId', description: 'Entity ID' })
  @Permissions('settings.view')
  findByEntity(
    @CurrentOrg() organizationId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.auditService.findByEntity(organizationId, entityType, entityId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit log by ID' })
  @Permissions('settings.view')
  findOne(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.auditService.findOne(organizationId, id);
  }
}
