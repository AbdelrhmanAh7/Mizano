import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { WorkforceSchedulingService } from '../services/workforce-scheduling.service';
import {
  ScheduleSuggestionDto,
  StaffingNeedDto,
  AttendancePatternDto,
  OvertimeAnalysisDto,
} from '../dto/workforce-scheduling.dto';

@ApiTags('AI - Workforce Scheduling')
@ApiBearerAuth()
@Controller('ai/workforce')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkforceSchedulingController {
  constructor(private workforceSchedulingService: WorkforceSchedulingService) {}

  @Get('suggest')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get AI-suggested staffing schedule for a given week' })
  @ApiQuery({
    name: 'weekStart',
    description: 'Start date of the week (ISO date string)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns suggested schedule for the week',
    type: ScheduleSuggestionDto,
  })
  async suggestSchedule(
    @CurrentOrg() orgId: string,
    @Query('weekStart') weekStart: string,
  ) {
    const result = await this.workforceSchedulingService.suggestSchedule(
      orgId,
      weekStart,
    );
    return { data: result };
  }

  @Get('staffing-needs')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Analyze staffing needs across departments' })
  @ApiResponse({
    status: 200,
    description: 'Returns staffing gap analysis by department',
    type: [StaffingNeedDto],
  })
  async getStaffingNeeds(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.workforceSchedulingService.getStaffingNeeds(orgId);
    return { data: result };
  }

  @Get('attendance-patterns')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Analyze attendance patterns across the organization' })
  @ApiResponse({
    status: 200,
    description: 'Returns attendance pattern data',
    type: [AttendancePatternDto],
  })
  async getAttendancePatterns(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.workforceSchedulingService.getAttendancePatterns(orgId);
    return { data: result };
  }

  @Get('overtime')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Analyze overtime patterns and get optimization recommendations' })
  @ApiResponse({
    status: 200,
    description: 'Returns overtime analysis with recommendations',
    type: OvertimeAnalysisDto,
  })
  async getOvertimeAnalysis(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.workforceSchedulingService.getOvertimeAnalysis(orgId);
    return { data: result };
  }
}
