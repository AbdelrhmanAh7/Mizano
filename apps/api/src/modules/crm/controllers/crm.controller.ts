import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LeadsService } from '../services/leads.service';
import { DealsService } from '../services/deals.service';
import { CurrentOrg, CurrentUser, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('CRM')
@ApiBearerAuth()
@Controller('crm')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly dealsService: DealsService,
  ) {}

  // Leads
  @Post('leads')
  @Permissions('crm.create')
  @ApiOperation({ summary: 'Create a new lead' })
  createLead(@CurrentOrg() orgId: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.leadsService.create(orgId, dto, user.id);
  }

  @Get('leads')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get all leads' })
  findAllLeads(@CurrentOrg() orgId: string, @Query() query: { status?: string; assignedToId?: string; source?: string }) {
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
  findOneLead(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.leadsService.findOne(orgId, id);
  }

  @Put('leads/:id')
  @Permissions('crm.edit')
  @ApiOperation({ summary: 'Update lead' })
  updateLead(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.leadsService.update(orgId, id, dto);
  }

  @Delete('leads/:id')
  @Permissions('crm.delete')
  @ApiOperation({ summary: 'Delete lead' })
  removeLead(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.leadsService.remove(orgId, id);
  }

  @Post('leads/:id/convert')
  @Permissions('crm.edit')
  @ApiOperation({ summary: 'Convert lead to customer' })
  convertLead(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.leadsService.convertToCustomer(orgId, id);
  }

  // Deals
  @Post('deals')
  @Permissions('crm.create')
  @ApiOperation({ summary: 'Create a new deal' })
  createDeal(@CurrentOrg() orgId: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.dealsService.create(orgId, dto, user.id);
  }

  @Get('deals')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get all deals' })
  findAllDeals(@CurrentOrg() orgId: string, @Query() query: { stage?: string; assignedToId?: string; customerId?: string }) {
    return this.dealsService.findAll(orgId, query);
  }

  @Get('deals/pipeline')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get deals pipeline' })
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
  findOneDeal(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.dealsService.findOne(orgId, id);
  }

  @Put('deals/:id')
  @Permissions('crm.edit')
  @ApiOperation({ summary: 'Update deal' })
  updateDeal(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.dealsService.update(orgId, id, dto);
  }

  @Delete('deals/:id')
  @Permissions('crm.delete')
  @ApiOperation({ summary: 'Delete deal' })
  removeDeal(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.dealsService.remove(orgId, id);
  }

}
