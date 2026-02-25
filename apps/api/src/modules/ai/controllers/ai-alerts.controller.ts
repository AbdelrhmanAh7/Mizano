import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AiAlertsService } from '../services/ai-alerts.service';
import { AlertCategory } from '@prisma/client';
import {
  AlertQueryDto,
  AlertLimitDto,
  DismissAlertDto,
  RecordActionDto,
  MarkAllReadDto,
  AlertListResponse,
  AlertSummaryResponse,
  UnifiedAlertResponse,
  AggregateResultResponse,
  MarkReadResultResponse,
} from '../dto/ai-alerts.dto';

@ApiTags('AI - Alerts')
@ApiBearerAuth()
@Controller('ai/alerts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiAlertsController {
  constructor(private readonly alertsService: AiAlertsService) {}

  @Get()
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get alerts with optional filtering' })
  @ApiResponse({ status: 200, type: AlertListResponse })
  async getAlerts(
    @CurrentOrg() organizationId: string,
    @Query() query: AlertQueryDto,
  ): Promise<AlertListResponse> {
    return this.alertsService.getAlerts(organizationId, {
      category: query.category,
      priority: query.priority,
      source: query.source,
      isRead: query.isRead,
      includeDismissed: query.includeDismissed,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('summary')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get alert summary for dashboard' })
  @ApiResponse({ status: 200, type: AlertSummaryResponse })
  async getSummary(@CurrentOrg() organizationId: string): Promise<AlertSummaryResponse> {
    return this.alertsService.getAlertSummary(organizationId);
  }

  @Get('critical')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get critical alerts only' })
  @ApiResponse({ status: 200, type: [UnifiedAlertResponse] })
  async getCritical(
    @CurrentOrg() organizationId: string,
    @Query() query: AlertLimitDto,
  ): Promise<UnifiedAlertResponse[]> {
    return this.alertsService.getCriticalAlerts(organizationId, query.limit);
  }

  @Get('category/:category')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get alerts by category' })
  @ApiParam({ name: 'category', enum: AlertCategory })
  @ApiResponse({ status: 200, type: [UnifiedAlertResponse] })
  async getByCategory(
    @CurrentOrg() organizationId: string,
    @Param('category') category: AlertCategory,
    @Query() query: AlertLimitDto,
  ): Promise<UnifiedAlertResponse[]> {
    return this.alertsService.getAlertsByCategory(organizationId, category, query.limit);
  }

  @Post('aggregate')
  @Permissions('ai.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aggregate alerts from all AI sources' })
  @ApiResponse({ status: 200, type: AggregateResultResponse })
  async aggregateAlerts(@CurrentOrg() organizationId: string): Promise<AggregateResultResponse> {
    return this.alertsService.aggregateAlerts(organizationId);
  }

  @Post(':id/read')
  @Permissions('ai.view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark an alert as read' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiResponse({ status: 204 })
  async markAsRead(
    @CurrentOrg() organizationId: string,
    @Param('id') alertId: string,
  ): Promise<void> {
    await this.alertsService.markAsRead(organizationId, alertId);
  }

  @Post('read-all')
  @Permissions('ai.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all alerts as read' })
  @ApiResponse({ status: 200, type: MarkReadResultResponse })
  async markAllAsRead(
    @CurrentOrg() organizationId: string,
    @Body() dto: MarkAllReadDto,
  ): Promise<MarkReadResultResponse> {
    const count = await this.alertsService.markAllAsRead(organizationId, dto.category);
    return { count };
  }

  @Post(':id/dismiss')
  @Permissions('ai.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss an alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiResponse({ status: 204 })
  async dismiss(
    @CurrentOrg() organizationId: string,
    @CurrentUser() user: { id: string },
    @Param('id') alertId: string,
    @Body() dto: DismissAlertDto,
  ): Promise<void> {
    await this.alertsService.dismissAlert(organizationId, alertId, user.id, dto.reason);
  }

  @Post(':id/action')
  @Permissions('ai.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record an action taken on an alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiResponse({ status: 204 })
  async recordAction(
    @CurrentOrg() organizationId: string,
    @Param('id') alertId: string,
    @Body() dto: RecordActionDto,
  ): Promise<void> {
    await this.alertsService.recordAction(organizationId, alertId, dto.action);
  }

  @Post('cleanup')
  @Permissions('ai.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean up expired alerts' })
  @ApiResponse({ status: 200, description: 'Number of alerts expired' })
  async cleanupExpired(@CurrentOrg() organizationId: string): Promise<{ expired: number }> {
    const expired = await this.alertsService.cleanupExpiredAlerts(organizationId);
    return { expired };
  }
}
