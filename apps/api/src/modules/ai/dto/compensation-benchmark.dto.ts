import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepartmentStatsDto {
  @ApiProperty({ description: 'Median salary in the department' })
  median: number;

  @ApiProperty({ description: '25th percentile salary' })
  p25: number;

  @ApiProperty({ description: '75th percentile salary' })
  p75: number;

  @ApiProperty({ description: 'Minimum salary in the department' })
  min: number;

  @ApiProperty({ description: 'Maximum salary in the department' })
  max: number;

  @ApiProperty({ description: 'Number of employees in the department' })
  count: number;
}

export class EmployeeBenchmarkDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee full name' })
  name: string;

  @ApiProperty({ description: 'Department the employee belongs to' })
  department: string;

  @ApiProperty({ description: 'Job title of the employee' })
  jobTitle: string;

  @ApiProperty({ description: 'Current salary of the employee' })
  salary: number;

  @ApiProperty({
    description: 'Department salary statistics',
    type: DepartmentStatsDto,
  })
  departmentStats: DepartmentStatsDto;

  @ApiProperty({
    description: 'Compensation index relative to department median (1.0 = at median)',
  })
  compensationIndex: number;

  @ApiProperty({
    description: 'Compensation status',
    enum: ['underpaid', 'competitive', 'overpaid'],
  })
  status: 'underpaid' | 'competitive' | 'overpaid';

  @ApiProperty({ description: 'Recommendation based on compensation analysis' })
  recommendation: string;
}

export class DepartmentBenchmarkDto {
  @ApiProperty({ description: 'Department name' })
  department: string;

  @ApiProperty({ description: 'Number of employees in the department' })
  count: number;

  @ApiProperty({ description: 'Median salary' })
  median: number;

  @ApiProperty({ description: '25th percentile salary' })
  p25: number;

  @ApiProperty({ description: '75th percentile salary' })
  p75: number;

  @ApiProperty({ description: 'Average salary across the department' })
  avgSalary: number;

  @ApiProperty({ description: 'Number of compensation outliers in the department' })
  outlierCount: number;
}

export class SalaryOutlierDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee full name' })
  name: string;

  @ApiProperty({ description: 'Department the employee belongs to' })
  department: string;

  @ApiProperty({ description: 'Current salary of the employee' })
  salary: number;

  @ApiProperty({
    description: 'Expected salary range based on department benchmarks',
    example: { min: 50000, max: 80000 },
  })
  expectedRange: { min: number; max: number };

  @ApiProperty({
    description: 'Direction of the outlier',
    enum: ['underpaid', 'overpaid'],
  })
  direction: 'underpaid' | 'overpaid';
}

export class SalaryDistributionDto {
  @ApiProperty({
    description: 'Salary distribution ranges with employee counts',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        range: { type: 'string', example: '40000-60000' },
        count: { type: 'number', example: 15 },
        percentage: { type: 'number', example: 0.25 },
      },
    },
  })
  ranges: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
}
