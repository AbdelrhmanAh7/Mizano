import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { ProjectsService } from '../services/projects.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { ProjectQueryDto } from '../dto/project-query.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Permissions('projects.create')
  @ApiOperation({ summary: 'Create a new project' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(orgId, dto);
  }

  @Get()
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get all projects' })
  findAll(@CurrentOrg() orgId: string, @Query() query: ProjectQueryDto) {
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
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
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
  createInvoice(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { startDate: string; endDate: string },
  ) {
    return this.projectsService.createInvoiceFromProject(orgId, id, dto);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('projects.delete')
  @ApiOperation({ summary: 'Bulk delete projects' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.projectsService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-activate')
  @Permissions('projects.edit')
  @ApiOperation({ summary: 'Bulk activate projects' })
  bulkActivate(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.projectsService.bulkUpdateStatus(orgId, dto.ids, ProjectStatus.ACTIVE);
  }

  @Post('bulk-complete')
  @Permissions('projects.edit')
  @ApiOperation({ summary: 'Bulk complete projects' })
  bulkComplete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.projectsService.bulkUpdateStatus(orgId, dto.ids, ProjectStatus.COMPLETED);
  }

  @Post('bulk-hold')
  @Permissions('projects.edit')
  @ApiOperation({ summary: 'Bulk put projects on hold' })
  bulkHold(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.projectsService.bulkUpdateStatus(orgId, dto.ids, ProjectStatus.ON_HOLD);
  }

  @Post('bulk-cancel')
  @Permissions('projects.edit')
  @ApiOperation({ summary: 'Bulk cancel projects' })
  bulkCancel(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.projectsService.bulkUpdateStatus(orgId, dto.ids, ProjectStatus.CANCELLED);
  }
}
