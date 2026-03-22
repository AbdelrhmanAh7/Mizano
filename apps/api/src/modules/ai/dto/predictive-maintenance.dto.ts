import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MaintenanceFactorDto {
  @ApiProperty({ description: 'Factor name contributing to health assessment' })
  factor: string;

  @ApiProperty({ description: 'Weight of the factor in the overall score (0-1)' })
  weight: number;

  @ApiProperty({ description: 'Human-readable description of the factor' })
  description: string;
}

export class AssetHealthDto {
  @ApiProperty({ description: 'Asset ID' })
  assetId: string;

  @ApiProperty({ description: 'Asset name' })
  assetName: string;

  @ApiProperty({ description: 'Overall health score (0-100)' })
  healthScore: number;

  @ApiProperty({ description: 'Risk score indicating likelihood of failure (0-1)' })
  riskScore: number;

  @ApiPropertyOptional({ description: 'Predicted failure date if risk is elevated' })
  predictedFailureDate?: string;

  @ApiProperty({
    description: 'Factors contributing to the health assessment',
    type: [MaintenanceFactorDto],
  })
  factors: MaintenanceFactorDto[];

  @ApiProperty({ description: 'Recommended maintenance action' })
  recommendedAction: string;
}

export class MaintenanceScheduleItemDto {
  @ApiProperty({ description: 'Asset ID' })
  assetId: string;

  @ApiProperty({ description: 'Asset name' })
  assetName: string;

  @ApiProperty({ description: 'Risk score indicating urgency (0-1)' })
  riskScore: number;

  @ApiProperty({ description: 'Predicted failure date' })
  predictedFailureDate: string;

  @ApiProperty({ description: 'Recommended maintenance action' })
  recommendedAction: string;
}

export class MaintenanceBatchDto {
  @ApiProperty({ description: 'Total number of assets processed' })
  processed: number;

  @ApiProperty({ description: 'Number of assets in critical condition' })
  critical: number;

  @ApiProperty({ description: 'Number of assets with warning status' })
  warning: number;

  @ApiProperty({ description: 'Number of assets in healthy condition' })
  healthy: number;
}
