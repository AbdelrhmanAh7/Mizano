import { ApiProperty } from '@nestjs/swagger';

export class QualityFactorDto {
  @ApiProperty({ description: 'Factor name contributing to quality prediction' })
  factor: string;

  @ApiProperty({ description: 'Impact score of the factor (0-1)' })
  impact: number;

  @ApiProperty({ description: 'Human-readable description of the factor' })
  description: string;
}

export class WorkOrderQualityDto {
  @ApiProperty({ description: 'Work order ID' })
  workOrderId: string;

  @ApiProperty({ description: 'Predicted defect risk score (0-1)' })
  defectRisk: number;

  @ApiProperty({
    description: 'Risk level classification',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  })
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({
    description: 'Factors contributing to the quality prediction',
    type: [QualityFactorDto],
  })
  factors: QualityFactorDto[];

  @ApiProperty({ description: 'Model confidence in the prediction (0-1)' })
  confidence: number;

  @ApiProperty({
    description: 'Recommendations to improve quality outcomes',
    type: [String],
  })
  recommendations: string[];
}

export class BomQualityMetricsDto {
  @ApiProperty({ description: 'Bill of Materials ID' })
  bomId: string;

  @ApiProperty({ description: 'Bill of Materials name' })
  bomName: string;

  @ApiProperty({ description: 'Total quantity produced' })
  totalProduced: number;

  @ApiProperty({ description: 'Total waste quantity recorded' })
  totalWaste: number;

  @ApiProperty({ description: 'Defect rate as a percentage (0-100)' })
  defectRate: number;

  @ApiProperty({ description: 'Average number of days to complete a work order' })
  avgCompletionDays: number;

  @ApiProperty({ description: 'Total number of work orders for this BOM' })
  workOrderCount: number;
}

export class QualityTrendDto {
  @ApiProperty({ description: 'Month in YYYY-MM format' })
  month: string;

  @ApiProperty({ description: 'Defect rate for the month as a percentage (0-100)' })
  defectRate: number;

  @ApiProperty({ description: 'Total quantity produced in the month' })
  producedQuantity: number;

  @ApiProperty({ description: 'Total waste quantity in the month' })
  wasteQuantity: number;
}
