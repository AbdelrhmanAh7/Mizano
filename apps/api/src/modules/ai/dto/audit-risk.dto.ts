import { ApiProperty } from '@nestjs/swagger';

export class AuditRiskFactorDto {
  @ApiProperty({ description: 'Factor name' })
  factor: string;

  @ApiProperty({ description: 'Factor weight' })
  weight: number;

  @ApiProperty({ description: 'Factor description' })
  description: string;
}

export class AuditRiskResponseDto {
  @ApiProperty({ description: 'Entity type' })
  entityType: string;

  @ApiProperty({ description: 'Entity ID' })
  entityId: string;

  @ApiProperty({ description: 'Risk score 0-1' })
  riskScore: number;

  @ApiProperty({ description: 'Risk level', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  riskLevel: string;

  @ApiProperty({ description: 'Risk factors', type: [AuditRiskFactorDto] })
  factors: AuditRiskFactorDto[];

  @ApiProperty({ description: 'Model confidence' })
  confidence: number;
}

export class AuditRiskBatchResponseDto {
  @ApiProperty() entityType: string;
  @ApiProperty() processed: number;
  @ApiProperty() highRisk: number;
  @ApiProperty() mediumRisk: number;
  @ApiProperty() lowRisk: number;
}

export class AuditRiskTrainingResponseDto {
  @ApiProperty() version: number;
  @ApiProperty() accuracy: number;
  @ApiProperty() sampleCount: number;
  @ApiProperty() message: string;
}
