import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FraudSignalDto {
  @ApiProperty({ description: 'Signal type' })
  signal: string;

  @ApiProperty({ description: 'Signal score 0-1' })
  score: number;

  @ApiProperty({ description: 'Whether this signal was triggered' })
  triggered: boolean;

  @ApiProperty({ description: 'Signal details' })
  details: string;
}

export class FraudScoreResponseDto {
  @ApiProperty({ description: 'Entity type' })
  entityType: string;

  @ApiProperty({ description: 'Entity ID' })
  entityId: string;

  @ApiProperty({ description: 'Overall fraud score 0-1' })
  fraudScore: number;

  @ApiProperty({ description: 'Risk level', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  riskLevel: string;

  @ApiProperty({ description: 'Individual fraud signals', type: [FraudSignalDto] })
  signals: FraudSignalDto[];

  @ApiProperty({ description: 'Model confidence' })
  confidence: number;
}

export class FraudAlertDto {
  @ApiProperty() id: string;
  @ApiProperty() entityType: string;
  @ApiProperty() entityId: string;
  @ApiProperty() fraudScore: number;
  @ApiProperty() signals: unknown[];
  @ApiProperty() isResolved: boolean;
  @ApiPropertyOptional() resolvedAt?: Date;
  @ApiProperty() createdAt: Date;
}

export class FraudScanResultDto {
  @ApiProperty() scanned: number;
  @ApiProperty() alertsCreated: number;
  @ApiProperty() highRisk: number;
}
