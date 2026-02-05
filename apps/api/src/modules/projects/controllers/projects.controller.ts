import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from '../services/projects.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Permissions('projects.create')
  @ApiOperation({ summary: 'Create a new project' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.projectsService.create(orgId, dto);
  }

  @Get()
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get all projects' })
  findAll(@CurrentOrg() orgId: string, @Query() query: { status?: string; customerId?: string }) {
    return this.projectsService.findAll(orgId, query);
  }

  @Get('summary')
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get project summary' })
  getSummary(@CurrentOrg() orgId: string) {
    return this.projectsService.getProjectSummary(orgId);
  }

  @Get(':id')
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get project by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.projectsService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('projects.edit')
  @ApiOperation({ summary: 'Update project' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.projectsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('projects.delete')
  @ApiOperation({ summary: 'Delete project' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.projectsService.remove(orgId, id);
  }

  @Get(':id/profitability')
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get project profitability analysis' })
  getProfitability(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.projectsService.getProjectProfitability(orgId, id);
  }

  @Post(':id/invoice')
  @Permissions('projects.create')
  @ApiOperation({ summary: 'Create invoice from project time entries' })
  createInvoice(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: { startDate: string; endDate: string }) {
    return this.projectsService.createInvoiceFromProject(orgId, id, dto);
  }
}
