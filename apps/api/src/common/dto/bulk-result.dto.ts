import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkFailureDto {
  @ApiProperty({ description: 'ID of the record that failed' })
  id: string;

  @ApiProperty({ description: 'Reason for failure' })
  reason: string;

  @ApiPropertyOptional({ description: 'Machine-readable reason code for UI translation' })
  code?: string;
}

export class BulkResultDto {
  @ApiProperty({ description: 'Number of records successfully processed' })
  processed: number;

  @ApiProperty({ description: 'Total number of records submitted' })
  total: number;

  @ApiPropertyOptional({
    description: 'Details of any failures',
    type: [BulkFailureDto],
  })
  failures?: BulkFailureDto[];
}
