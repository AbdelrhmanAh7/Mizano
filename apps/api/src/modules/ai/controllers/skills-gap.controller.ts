import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { SkillsGapService } from '../services/skills-gap.service';
import {
  EmployeeSkillGapDto,
  DepartmentGapDto,
  SkillInventoryDto,
  MatchRequiredSkillsDto,
  EmployeeMatchDto,
} from '../dto/skills-gap.dto';

@ApiTags('AI - Skills Gap Analysis')
@ApiBearerAuth()
@Controller('ai/skills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SkillsGapController {
  constructor(private skillsGapService: SkillsGapService) {}

  @Get('employee/:employeeId/gap')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Analyze skill gaps for a specific employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns skill gap analysis for the employee',
    type: EmployeeSkillGapDto,
  })
  async analyzeEmployeeGap(@CurrentOrg() orgId: string, @Param('employeeId') employeeId: string) {
    const result = await this.skillsGapService.analyzeEmployeeGap(orgId, employeeId);
    return { data: result };
  }

  @Get('department/:department/gap')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Analyze skill gaps for an entire department' })
  @ApiParam({ name: 'department', description: 'Department name' })
  @ApiResponse({
    status: 200,
    description: 'Returns department-level skill gap analysis',
    type: DepartmentGapDto,
  })
  async analyzeDepartmentGap(@CurrentOrg() orgId: string, @Param('department') department: string) {
    const result = await this.skillsGapService.analyzeDepartmentGap(orgId, department);
    return { data: result };
  }

  @Get('inventory')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get organization-wide skills inventory' })
  @ApiResponse({
    status: 200,
    description: 'Returns aggregated skills inventory across all employees',
    type: [SkillInventoryDto],
  })
  async getSkillsInventory(@CurrentOrg() orgId: string) {
    const result = await this.skillsGapService.getSkillsInventory(orgId);
    return { data: result };
  }

  @Post('match')
  @Permissions('hr.manage')
  @ApiOperation({ summary: 'Match employees to a role based on required skills' })
  @ApiResponse({
    status: 200,
    description: 'Returns employees ranked by match score for the required skills',
    type: [EmployeeMatchDto],
  })
  async matchEmployeesToRole(@CurrentOrg() orgId: string, @Body() body: MatchRequiredSkillsDto) {
    const result = await this.skillsGapService.matchEmployeesToRole(orgId, body.requiredSkills);
    return { data: result };
  }
}
