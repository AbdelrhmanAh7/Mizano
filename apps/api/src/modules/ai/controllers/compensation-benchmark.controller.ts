import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CompensationBenchmarkService } from '../services/compensation-benchmark.service';
import {
  EmployeeBenchmarkDto,
  DepartmentBenchmarkDto,
  SalaryOutlierDto,
  SalaryDistributionDto,
} from '../dto/compensation-benchmark.dto';

@ApiTags('AI - Compensation Benchmark')
@ApiBearerAuth()
@Controller('ai/compensation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompensationBenchmarkController {
  constructor(private compensationService: CompensationBenchmarkService) {}

  @Get('employee/:employeeId')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Benchmark compensation for a specific employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns compensation benchmark for the employee',
    type: EmployeeBenchmarkDto,
  })
  async benchmarkEmployee(
    @CurrentOrg() orgId: string,
    @Param('employeeId') employeeId: string,
  ) {
    const result = await this.compensationService.benchmarkEmployee(
      orgId,
      employeeId,
    );
    return { data: result };
  }

  @Get('departments')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get compensation benchmarks across all departments' })
  @ApiResponse({
    status: 200,
    description: 'Returns department-level compensation benchmarks',
    type: [DepartmentBenchmarkDto],
  })
  async getDepartmentBenchmarks(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.compensationService.getDepartmentBenchmarks(orgId);
    return { data: result };
  }

  @Get('outliers')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get salary outliers across the organization' })
  @ApiResponse({
    status: 200,
    description: 'Returns employees with salaries significantly above or below benchmarks',
    type: [SalaryOutlierDto],
  })
  async getOutliers(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.compensationService.getOutliers(orgId);
    return { data: result };
  }

  @Get('distribution')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get salary distribution across the organization' })
  @ApiResponse({
    status: 200,
    description: 'Returns salary distribution with ranges and counts',
    type: SalaryDistributionDto,
  })
  async getSalaryDistribution(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.compensationService.getSalaryDistribution(orgId);
    return { data: result };
  }
}
