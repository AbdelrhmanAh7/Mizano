import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class VatSummaryQueryDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-31' })
  @IsDateString()
  endDate: string;
}
