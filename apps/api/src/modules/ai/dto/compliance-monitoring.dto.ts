import { ApiProperty } from '@nestjs/swagger';

export class ComplianceViolationDto {
  @ApiProperty({ description: 'Violation type' })
  type: string;

  @ApiProperty({ description: 'Severity level', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  severity: string;

  @ApiProperty({ description: 'Entity type' })
  entityType: string;

  @ApiProperty({ description: 'Entity ID' })
  entityId: string;

  @ApiProperty({ description: 'Violation description' })
  description: string;

  @ApiProperty({ description: 'Recommended action' })
  recommendation: string;
}

export class ComplianceReportDto {
  @ApiProperty({ description: 'Overall compliance score 0-100' })
  score: number;

  @ApiProperty({ description: 'Total checks performed' })
  totalChecks: number;

  @ApiProperty({ description: 'Checks passed' })
  passed: number;

  @ApiProperty({ description: 'List of violations', type: [ComplianceViolationDto] })
  violations: ComplianceViolationDto[];

  @ApiProperty({ description: 'Check timestamp' })
  checkedAt: Date;
}

export class ComplianceCategoryScoreDto {
  @ApiProperty() category: string;
  @ApiProperty() score: number;
  @ApiProperty() checks: number;
  @ApiProperty() violations: number;
}

export class ComplianceScoreResponseDto {
  @ApiProperty({ description: 'Overall compliance score' })
  overallScore: number;

  @ApiProperty({ description: 'Scores by category', type: [ComplianceCategoryScoreDto] })
  categories: ComplianceCategoryScoreDto[];
}
