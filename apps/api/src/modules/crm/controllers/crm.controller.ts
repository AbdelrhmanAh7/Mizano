import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { LeadsService, CreateLeadDto, UpdateLeadDto, LeadQueryDto } from '../services/leads.service';
import { DealsService, CreateDealDto, UpdateDealDto, DealQueryDto } from '../services/deals.service';
import { ActivitiesService, CreateActivityDto, ActivityQueryDto } from '../services/activities.service';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { DealStage } from '@prisma/client';

@ApiTags('CRM')
@ApiBearerAuth()
@Controller('crm')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly dealsService: DealsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  // ============ Leads ============

  @Post('leads')
  @Permissions('crm.create')
  @ApiOperation({ summary: 'Create a new lead' })
  createLead(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadsService.create(orgId, dto, user.id);
  }

  @Get('leads')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get all leads' })
  findAllLeads(@CurrentOrg() orgId: string, @Query() query: LeadQueryDto) {
    return this.leadsService.findAll(orgId, query);
  }

  @Get('leads/stats')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get lead statistics' })
  getLeadStats(@CurrentOrg() orgId: string) {
    return this.leadsService.getLeadStats(orgId);
  }

  @Get('leads/:id')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get lead by ID' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  findOneLead(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.leadsService.findOne(orgId, id);
  }

  @Put('leads/:id')
  @Permissions('crm.edit')
  @ApiOperation({ summary: 'Update lead' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  updateLead(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(orgId, id, dto);
  }

  @Delete('leads/:id')
  @Permissions('crm.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete lead' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  removeLead(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.leadsService.remove(orgId, id);
  }

  @Post('leads/:id/convert')
  @Permissions('crm.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert lead to customer' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  convertLead(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() options?: { createDeal?: boolean; dealValue?: number },
  ) {
    return this.leadsService.convertToCustomer(orgId, id, options);
  }

  @Post('leads/:id/assign')
  @Permissions('crm.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign lead to user' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  assignLead(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { assignedToId: string },
  ) {
    return this.leadsService.assignLead(orgId, id, dto.assignedToId);
  }

  @Post('leads/bulk-assign')
  @Permissions('crm.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk assign leads to user' })
  bulkAssignLeads(
    @CurrentOrg() orgId: string,
    @Body() dto: { leadIds: string[]; assignedToId: string },
  ) {
    return this.leadsService.bulkAssign(orgId, dto.leadIds, dto.assignedToId);
  }

  // ============ Deals ============

  @Post('deals')
  @Permissions('crm.create')
  @ApiOperation({ summary: 'Create a new deal' })
  createDeal(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDealDto,
  ) {
    return this.dealsService.create(orgId, dto, user.id);
  }

  @Get('deals')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get all deals' })
  findAllDeals(@CurrentOrg() orgId: string, @Query() query: DealQueryDto) {
    return this.dealsService.findAll(orgId, query);
  }

  @Get('deals/pipeline')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get deals pipeline for Kanban view' })
  getPipeline(@CurrentOrg() orgId: string) {
    return this.dealsService.getPipeline(orgId);
  }

  @Get('deals/stats')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get deal statistics' })
  getDealStats(@CurrentOrg() orgId: string) {
    return this.dealsService.getDealStats(orgId);
  }

  @Get('deals/:id')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get deal by ID' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  findOneDeal(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.dealsService.findOne(orgId, id);
  }

  @Put('deals/:id')
  @Permissions('crm.edit')
  @ApiOperation({ summary: 'Update deal' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  updateDeal(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.dealsService.update(orgId, id, dto);
  }

  @Post('deals/:id/stage')
  @Permissions('crm.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update deal stage (for Kanban drag-drop)' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  updateDealStage(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { stage: DealStage },
  ) {
    return this.dealsService.updateStage(orgId, id, dto.stage);
  }

  @Post('deals/:id/won')
  @Permissions('crm.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark deal as won' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  markDealWon(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() options?: { createQuote?: boolean },
  ) {
    return this.dealsService.markWon(orgId, id, options);
  }

  @Post('deals/:id/lost')
  @Permissions('crm.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark deal as lost' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  markDealLost(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto?: { reason?: string },
  ) {
    return this.dealsService.markLost(orgId, id, dto?.reason);
  }

  @Post('deals/:id/assign')
  @Permissions('crm.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign deal to user' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  assignDeal(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { assignedToId: string },
  ) {
    return this.dealsService.assignDeal(orgId, id, dto.assignedToId);
  }

  @Delete('deals/:id')
  @Permissions('crm.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete deal' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  removeDeal(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.dealsService.remove(orgId, id);
  }

  // ============ Activities ============

  @Post('activities')
  @Permissions('crm.create')
  @ApiOperation({ summary: 'Create a new activity' })
  createActivity(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateActivityDto,
  ) {
    return this.activitiesService.create(orgId, dto, user.id);
  }

  @Get('activities')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get all activities' })
  findAllActivities(@CurrentOrg() orgId: string, @Query() query: ActivityQueryDto) {
    return this.activitiesService.findAll(orgId, query);
  }

  @Get('activities/recent')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get recent activities' })
  getRecentActivities(
    @CurrentOrg() orgId: string,
    @Query('limit') limit?: number,
  ) {
    return this.activitiesService.getRecentActivities(orgId, limit);
  }

  @Get('activities/stats')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get activity statistics' })
  getActivityStats(@CurrentOrg() orgId: string) {
    return this.activitiesService.getActivityStats(orgId);
  }

  @Get('activities/:id')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get activity by ID' })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  findOneActivity(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.activitiesService.findOne(orgId, id);
  }

  @Delete('activities/:id')
  @Permissions('crm.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete activity' })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  removeActivity(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.activitiesService.remove(orgId, id);
  }

  // Quick activity logging endpoints
  @Post('activities/log-call')
  @Permissions('crm.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log a call activity' })
  logCall(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: { leadId?: string; dealId?: string; description: string },
  ) {
    return this.activitiesService.logCall(orgId, user.id, dto);
  }

  @Post('activities/log-email')
  @Permissions('crm.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log an email activity' })
  logEmail(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: { leadId?: string; dealId?: string; description: string },
  ) {
    return this.activitiesService.logEmail(orgId, user.id, dto);
  }

  @Post('activities/log-meeting')
  @Permissions('crm.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log a meeting activity' })
  logMeeting(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: { leadId?: string; dealId?: string; description: string; date?: string },
  ) {
    return this.activitiesService.logMeeting(orgId, user.id, dto);
  }

  @Post('activities/log-note')
  @Permissions('crm.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log a note activity' })
  logNote(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: { leadId?: string; dealId?: string; description: string },
  ) {
    return this.activitiesService.logNote(orgId, user.id, dto);
  }
}
