import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  ArrayMinSize,
  IsObject,
  IsInt,
  Min,
  Max,
  ValidateNested,
  ArrayMaxSize,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  IsDecimalString,
  MAX_INTEGER_DIGITS,
  MAX_FRACTION_DIGITS,
} from '../../../common/dto/decimal-string';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Bulk approval uses the same precision bounds as the confirm DTO. */
export const DECIMAL_STRING_PATTERN = new RegExp(
  `^\\d{1,${MAX_INTEGER_DIGITS}}(\\.\\d{1,${MAX_FRACTION_DIGITS}})?$`,
);
export const PERCENT_STRING_PATTERN = new RegExp(`^\\d{1,${MAX_INTEGER_DIGITS}}(\\.\\d{1,2})?$`);

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
  @IsDecimalString()
  quantity: string;

  @ApiProperty({ description: 'Unit price / rate as a decimal string', example: '100.00' })
  @IsString()
  @IsDecimalString()
  rate: string;

  @ApiPropertyOptional({
    description:
      'Tax rate as a PERCENTAGE decimal string (14 => 14%), never a tax amount. ' +
      'Omit only when taxRateId is given; the rate is then taken from the tax rate record.',
    example: '14',
  })
  @IsString()
  @IsOptional()
  @IsDecimalString(2)
  taxRatePercent?: string;

  @ApiPropertyOptional({
    description: 'Line discount as a PERCENTAGE decimal string (invoices only)',
    example: '0',
  })
  @IsString()
  @IsOptional()
  @IsDecimalString(2)
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

  @ApiPropertyOptional({
    description: 'Intake job this draft comes from; it is marked APPROVED and linked to the draft',
  })
  @IsString()
  @IsOptional()
  jobId?: string;
}

export const INTAKE_JOB_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'EXTRACTED',
  'NEEDS_REVIEW',
  'FAILED',
  'DEAD_LETTER',
  'APPROVED',
] as const;

export class ListIntakeJobsDto {
  @ApiPropertyOptional({
    enum: INTAKE_JOB_STATUSES,
    isArray: true,
    description: 'One status or a comma-separated list',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(INTAKE_JOB_STATUSES, { each: true })
  @IsOptional()
  status?: (typeof INTAKE_JOB_STATUSES)[number][];

  @ApiPropertyOptional({ enum: ['WEB', 'TELEGRAM'] })
  @IsIn(['WEB', 'TELEGRAM'])
  @IsOptional()
  source?: 'WEB' | 'TELEGRAM';

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Created on/after (date)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Created on/before (date)' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'Vendor name, invoice number or file name' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export class BulkApproveIntakeDto {
  @ApiProperty({ description: 'Intake jobs to approve (only complete EXTRACTED jobs succeed)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  jobIds: string[];
}
