import { IsString, IsOptional, IsObject, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OcrExtractDto {
  @ApiPropertyOptional({
    description: 'Vendor ID hint for layout learning',
    example: 'clx123...',
  })
  @IsString()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Language for OCR (default: eng+ara)',
    example: 'eng+ara',
  })
  @IsString()
  @IsOptional()
  language?: string;
}

export class OcrLearnDto {
  @ApiProperty({
    description: 'Vendor ID for layout learning',
    example: 'clx123...',
  })
  @IsString()
  vendorId: string;

  @ApiPropertyOptional({
    description: 'Corrected date value',
    example: '2024-01-15',
  })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    description: 'Corrected total amount',
    example: 1500.0,
  })
  @IsNumber()
  @IsOptional()
  total?: number;

  @ApiPropertyOptional({
    description: 'Corrected subtotal amount',
    example: 1350.0,
  })
  @IsNumber()
  @IsOptional()
  subtotal?: number;

  @ApiPropertyOptional({
    description: 'Corrected tax amount',
    example: 150.0,
  })
  @IsNumber()
  @IsOptional()
  tax?: number;

  @ApiPropertyOptional({
    description: 'Corrected invoice number',
    example: 'INV-2024-001',
  })
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @ApiPropertyOptional({
    description: 'Corrected vendor name',
    example: 'Acme Corporation',
  })
  @IsString()
  @IsOptional()
  vendorName?: string;
}

export class DuplicateCheckDto {
  @ApiPropertyOptional({
    description: 'Vendor ID to check against',
    example: 'clx123...',
  })
  @IsString()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Invoice/bill number to check',
    example: 'INV-2024-001',
  })
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @ApiPropertyOptional({
    description: 'Amount to check',
    example: 1500.0,
  })
  @IsNumber()
  @IsOptional()
  amount?: number;
}
