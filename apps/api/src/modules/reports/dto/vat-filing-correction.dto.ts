import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum CorrectionReason {
  OmittedInvoiceAdjustment = 'omitted_invoice_adjustment',
  TaxRateError = 'tax_rate_error',
  ForeignCurrency = 'foreign_currency',
  DataEntryError = 'data_entry_error',
  Other = 'other',
}

export class RecordVatFilingCorrectionDto {
  @ApiProperty({
    description: 'VAT return period that was corrected or amended',
    example: '2024-02',
  })
  @IsNotEmpty()
  @IsString()
  period: string;

  @ApiProperty({
    description: 'Reason for the filing correction/amendment (standard taxonomy)',
    enum: CorrectionReason,
    example: CorrectionReason.OmittedInvoiceAdjustment,
  })
  @IsEnum(CorrectionReason, { message: 'reason must be one of the allowed taxonomy values' })
  reason: CorrectionReason;

  @ApiPropertyOptional({
    description: 'Additional free-text explanation (optional)',
    example: 'Invoice #INV-123 was missed in the initial filing',
  })
  @IsOptional()
  @IsString()
  additionalNotes?: string;
}
