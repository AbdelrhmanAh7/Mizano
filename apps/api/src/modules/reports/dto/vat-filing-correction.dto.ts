import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RecordVatFilingCorrectionDto {
  @ApiProperty({
    description: 'VAT return period that was corrected or amended',
    example: '2024-02',
  })
  @IsNotEmpty()
  @IsString()
  period: string;

  @ApiPropertyOptional({
    description: 'Reason for the filing correction/amendment (standard taxonomy)',
    example: 'omitted_invoice_adjustment',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
