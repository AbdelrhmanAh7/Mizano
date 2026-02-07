import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AttritionLimitDto {
  @ApiPropertyOptional({
    description: 'Maximum number of employees to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class AttritionFactorDto {
  @ApiProperty({ description: 'Factor name contributing to attrition risk' })
  factor: string;

  @ApiProperty({ description: 'Impact score of the factor (0-1)' })
  impact: number;

  @ApiProperty({ description: 'Human-readable description of the factor' })
  description: string;
}

export class AttritionPredictionDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee full name' })
  employeeName: string;

  @ApiProperty({ description: 'Attrition risk score (0-1)' })
  attritionRisk: number;

  @ApiProperty({
    description: 'Risk level classification',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  })
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({
    description: 'Factors contributing to the attrition risk',
    type: [AttritionFactorDto],
  })
  factors: AttritionFactorDto[];

  @ApiProperty({ description: 'Model confidence in the prediction (0-1)' })
  confidence: number;

  @ApiProperty({ description: 'Recommended action to reduce attrition risk' })
  recommendation: string;
}

export class FlightRiskDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee name' })
  name: string;

  @ApiProperty({ description: 'Department the employee belongs to' })
  department: string;

  @ApiProperty({ description: 'Attrition risk score (0-1)' })
  attritionRisk: number;

  @ApiProperty({
    description: 'Risk level classification',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  })
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({
    description: 'Top factors contributing to flight risk',
    type: [AttritionFactorDto],
  })
  factors: AttritionFactorDto[];
}

export class AttritionBatchDto {
  @ApiProperty({ description: 'Total number of employees processed' })
  processed: number;

  @ApiProperty({ description: 'Number of employees classified as high risk' })
  highRisk: number;

  @ApiProperty({ description: 'Number of employees classified as medium risk' })
  mediumRisk: number;

  @ApiProperty({ description: 'Number of employees classified as low risk' })
  lowRisk: number;
}

export class AttritionTrainingDto {
  @ApiProperty({ description: 'Model version identifier' })
  version: string;

  @ApiProperty({ description: 'Model accuracy after training (0-1)' })
  accuracy: number;

  @ApiProperty({ description: 'Number of training samples used' })
  sampleCount: number;

  @ApiProperty({ description: 'Training result message' })
  message: string;
}
