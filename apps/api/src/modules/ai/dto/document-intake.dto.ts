import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  IsNumber,
  IsObject,
  ValidateNested,
  Min,
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

  @ApiProperty({ description: 'Line item description', example: 'Office Supplies' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Quantity', example: 2 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ description: 'Unit price / rate', example: 49.99 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rate: number;

  @ApiPropertyOptional({
    description: 'Tax rate percentage',
    example: 14,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  taxRate?: number;
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
