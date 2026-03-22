import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { EmployeeAttritionService } from '../services/employee-attrition.service';
import {
  AttritionLimitDto,
  AttritionPredictionDto,
  FlightRiskDto,
  AttritionBatchDto,
  AttritionTrainingDto,
} from '../dto/employee-attrition.dto';

@ApiTags('AI - Employee Attrition')
@ApiBearerAuth()
@Controller('ai/attrition')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeAttritionController {
  constructor(private attritionService: EmployeeAttritionService) {}

  @Get('employee/:employeeId')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Predict attrition risk for a specific employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns attrition prediction for the employee',
    type: AttritionPredictionDto,
  })
  async predictAttrition(
    @CurrentOrg() orgId: string,
    @Param('employeeId') employeeId: string,
  ): Promise<{ data: AttritionPredictionDto }> {
    const result = await this.attritionService.predictAttrition(orgId, employeeId);
    return { data: result };
  }

  @Get('flight-risk')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get employees with highest flight risk' })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of employees to return',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of employees with highest attrition risk',
    type: [FlightRiskDto],
  })
  async getFlightRisk(@CurrentOrg() orgId: string, @Query() query: AttritionLimitDto) {
    const result = await this.attritionService.getFlightRisk(orgId, query.limit || 20);
    return { data: result };
  }

  @Post('predict-all')
  @Permissions('hr.manage')
  @ApiOperation({ summary: 'Batch predict attrition for all employees' })
  @ApiResponse({
    status: 200,
    description: 'Returns batch prediction summary',
    type: AttritionBatchDto,
  })
  async predictAll(@CurrentOrg() orgId: string): Promise<{ data: AttritionBatchDto }> {
    const result = await this.attritionService.predictAll(orgId);
    return { data: result };
  }

  @Post('train')
  @Permissions('hr.manage')
  @ApiOperation({ summary: 'Train attrition prediction ML model' })
  @ApiResponse({
    status: 200,
    description: 'Returns training results including accuracy metrics',
    type: AttritionTrainingDto,
  })
  async trainModel(@CurrentOrg() orgId: string) {
    const result = await this.attritionService.trainModel(orgId);
    return { data: result };
  }
}
