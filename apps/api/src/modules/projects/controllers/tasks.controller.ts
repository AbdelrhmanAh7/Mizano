import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasksService } from '../services/tasks.service';
import { CurrentOrg, CurrentUser, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Permissions('projects.create')
  @ApiOperation({ summary: 'Create a new task' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.tasksService.create(orgId, dto);
  }

  @Get()
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get all tasks' })
  findAll(@CurrentOrg() orgId: string, @Query() query: { projectId?: string; status?: string; assigneeId?: string }) {
    return this.tasksService.findAll(orgId, query);
  }

  @Get('my-tasks')
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get my assigned tasks' })
  getMyTasks(@CurrentOrg() orgId: string, @CurrentUser() user: any) {
    return this.tasksService.getMyTasks(orgId, user.id);
  }

  @Get('stats')
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get task statistics' })
  getStats(@CurrentOrg() orgId: string, @Query('projectId') projectId?: string) {
    return this.tasksService.getTaskStats(orgId, projectId);
  }

  @Get('project/:projectId')
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get tasks by project' })
  getByProject(@CurrentOrg() orgId: string, @Param('projectId') projectId: string) {
    return this.tasksService.getTasksByProject(orgId, projectId);
  }

  @Get(':id')
  @Permissions('projects.view')
  @ApiOperation({ summary: 'Get task by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.tasksService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('projects.edit')
  @ApiOperation({ summary: 'Update task' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.tasksService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('projects.delete')
  @ApiOperation({ summary: 'Delete task' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.tasksService.remove(orgId, id);
  }

  @Put('sort-order/update')
  @Permissions('projects.edit')
  @ApiOperation({ summary: 'Update task sort order' })
  updateSortOrder(@CurrentOrg() orgId: string, @Body() dto: { taskOrders: { id: string; sortOrder: number }[] }) {
    return this.tasksService.updateSortOrder(orgId, dto.taskOrders);
  }
}
