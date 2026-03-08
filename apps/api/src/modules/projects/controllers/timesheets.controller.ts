import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CreateTimesheetDto,
  UpdateTimesheetDto,
  TimesheetsService,
} from '../services/timesheets.service';
import { CurrentOrg, CurrentUser, Permissions } from '../../../common/decorators';
import { CurrentUserData } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Timesheets')
@ApiBearerAuth()
@Controller('timesheets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Post()
  @Permissions('timesheets.create')
  @ApiOperation({ summary: 'Create timesheet entry' })
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateTimesheetDto,
  ) {
    return this.timesheetsService.create(orgId, user.id, dto);
  }

  @Post('timer/start')
  @Permissions('timesheets.create')
  @ApiOperation({ summary: 'Start timer' })
  startTimer(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: { projectId: string; taskId?: string; description?: string },
  ) {
    return this.timesheetsService.startTimer(orgId, user.id, dto);
  }

  @Post('timer/stop/:id')
  @Permissions('timesheets.edit')
  @ApiOperation({ summary: 'Stop timer' })
  stopTimer(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.timesheetsService.stopTimer(orgId, user.id, id);
  }

  @Get('timer/running')
  @Permissions('timesheets.view')
  @ApiOperation({ summary: 'Get running timer' })
  getRunningTimer(@CurrentOrg() orgId: string, @CurrentUser() user: CurrentUserData) {
    return this.timesheetsService.getRunningTimer(orgId, user.id);
  }

  @Get()
  @Permissions('timesheets.view')
  @ApiOperation({ summary: 'Get timesheet entries' })
  findAll(
    @CurrentOrg() orgId: string,
    @Query()
    query: {
      userId?: string;
      projectId?: string;
      startDate?: string;
      endDate?: string;
      isBilled?: boolean;
    },
  ) {
    return this.timesheetsService.findAll(orgId, query);
  }

  @Get('weekly-summary')
  @Permissions('timesheets.view')
  @ApiOperation({ summary: 'Get weekly summary' })
  getWeeklySummary(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('weekStart') weekStart: string,
  ) {
    return this.timesheetsService.getWeeklySummary(orgId, user.id, weekStart);
  }

  @Get('report')
  @Permissions('timesheets.view')
  @ApiOperation({ summary: 'Get timesheet report' })
  getReport(
    @CurrentOrg() orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy: 'user' | 'project',
  ) {
    return this.timesheetsService.getTimesheetReport(orgId, startDate, endDate, groupBy || 'user');
  }

  @Get(':id')
  @Permissions('timesheets.view')
  @ApiOperation({ summary: 'Get timesheet entry by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.timesheetsService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('timesheets.edit')
  @ApiOperation({ summary: 'Update timesheet entry' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateTimesheetDto) {
    return this.timesheetsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('timesheets.delete')
  @ApiOperation({ summary: 'Delete timesheet entry' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.timesheetsService.remove(orgId, id);
  }
}
