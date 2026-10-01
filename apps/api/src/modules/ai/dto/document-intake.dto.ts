import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  Matches,
  ArrayMinSize,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessDocumentDto {
  @ApiPropertyOptional({
    description: 'OCR language (default: eng+ara)',
    example: 'eng+ara',
  })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({
    description: 'Force document type instead of auto-classification',
    enum: ['BILL', 'INVOICE'],
    example: 'BILL',
  })
  @IsIn(['BILL', 'INVOICE'])
  @IsOptional()
  forceType?: 'BILL' | 'INVOICE';

  @ApiPropertyOptional({
    description:
      'Scan mode: "fast" (PaddleOCR + text model), "slow" (qwen3-vl:8b vision). ' +
      'Or advanced: "ocr", "hybrid", "vlm", "auto".',
    enum: ['fast', 'slow', 'ocr', 'hybrid', 'vlm', 'auto'],
    example: 'fast',
  })
  @IsIn(['fast', 'slow', 'ocr', 'hybrid', 'vlm', 'auto'])
  @IsOptional()
  strategy?: 'fast' | 'slow' | 'ocr' | 'hybrid' | 'vlm' | 'auto';
}

/** Non-negative decimal string, e.g. "2", "100.50". No exponents, no signs. */
export const DECIMAL_STRING_PATTERN = /^\d{1,15}(\.\d{1,6})?$/;
/** Percentage string with at most 2 decimal places (matches Decimal(5,2) storage). */
export const PERCENT_STRING_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

export class ConfirmIntakeLineDto {
  @ApiPropertyOptional({ description: 'Item ID to link', example: 'clx123...' })
  @IsString()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({
    description: 'Account ID to post to',
    example: 'clx456...',
  })
  @IsString()
  @IsOptional()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Tax rate record ID', example: 'clx789...' })
  @IsString()
  @IsOptional()
  taxRateId?: string;

  @ApiProperty({ description: 'Line item description', example: 'Office Supplies' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Quantity as a decimal string', example: '2' })
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, { message: 'quantity must be a non-negative decimal string' })
  quantity: string;

  @ApiProperty({ description: 'Unit price / rate as a decimal string', example: '100.00' })
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, { message: 'rate must be a non-negative decimal string' })
  rate: string;

  @ApiPropertyOptional({
    description:
      'Tax rate as a PERCENTAGE decimal string (14 => 14%), never a tax amount. ' +
      'Omit only when taxRateId is given; the rate is then taken from the tax rate record.',
    example: '14',
  })
  @IsString()
  @IsOptional()
  @Matches(PERCENT_STRING_PATTERN, {
    message: 'taxRatePercent must be a percentage with at most 2 decimal places',
  })
  taxRatePercent?: string;

  @ApiPropertyOptional({
    description: 'Line discount as a PERCENTAGE decimal string (invoices only)',
    example: '0',
  })
  @IsString()
  @IsOptional()
  @Matches(PERCENT_STRING_PATTERN, {
    message: 'discountPercent must be a percentage with at most 2 decimal places',
  })
  discountPercent?: string;
}

export class ConfirmIntakeDto {
  @ApiProperty({
    description: 'Document type to create',
    enum: ['BILL', 'INVOICE'],
    example: 'BILL',
  })
  @IsIn(['BILL', 'INVOICE'])
  type: 'BILL' | 'INVOICE';

  @ApiPropertyOptional({
    description: 'Vendor ID (required for BILL)',
    example: 'clx123...',
  })
  @IsString()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Customer ID (required for INVOICE)',
    example: 'clx456...',
  })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ description: 'Document date', example: '2024-01-15' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Due date', example: '2024-02-14' })
  @IsString()
  dueDate: string;

  @ApiPropertyOptional({
    description: 'Document number (auto-generated if not provided)',
    example: 'INV-2024-001',
  })
  @IsString()
  @IsOptional()
  documentNumber?: string;

  @ApiProperty({
    description: 'Line items',
    type: [ConfirmIntakeLineDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmIntakeLineDto)
  lines: ConfirmIntakeLineDto[];

  @ApiPropertyOptional({ description: 'Vendor document reference number', example: 'INV-001' })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({ description: 'Currency code (ISO 4217)', example: 'USD' })
  @IsString()
  @IsOptional()
  currencyCode?: string;

  @ApiPropertyOptional({ description: 'Notes', example: 'Scanned from PDF' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Project ID to link',
    example: 'clx789...',
  })
  @IsString()
  @IsOptional()
  projectId?: string;

  @ApiPropertyOptional({
    description:
      'User corrections to feed back for vendor layout learning (field name → corrected value)',
  })
  @IsObject()
  @IsOptional()
  corrections?: Record<string, unknown>;
}
