import { IsString, IsOptional, IsObject, IsNumber, IsArray, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OcrTrainingExtractDto {
  @ApiPropertyOptional({ description: 'Vendor ID for layout-aware extraction' })
  @IsString()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'OCR language code',
    default: 'eng+ara',
  })
  @IsString()
  @IsOptional()
  language?: string;
}

export class OcrTrainingSubmitDto {
  @ApiProperty({ description: 'Vendor ID to associate corrections with' })
  @IsString()
  vendorId: string;

  @ApiProperty({ description: 'Raw OCR text from the extraction' })
  @IsString()
  rawText: string;

  @ApiProperty({ description: 'Fields as originally extracted by OCR' })
  @IsObject()
  extractedFields: Record<string, any>;

  @ApiProperty({ description: 'User-corrected field values' })
  @IsObject()
  correctedFields: Record<string, any>;

  @ApiPropertyOptional({ description: 'Optional notes about the correction' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class OcrBatchTrainingDto {
  @ApiProperty({ description: 'Vendor ID for batch extraction' })
  @IsString()
  vendorId: string;

  @ApiPropertyOptional({
    description: 'OCR language code',
    default: 'eng+ara',
  })
  @IsString()
  @IsOptional()
  language?: string;
}

export class OcrVendorHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Limit number of results', default: 20 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Page offset', default: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  offset?: number = 0;
}

/**
 * DTO for batch extraction from multiple files
 */
export class OcrBatchExtractDto {
  @ApiProperty({
    description: 'Array of base64 encoded images',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiProperty({ description: 'Vendor ID (same for all images in batch)' })
  @IsString()
  vendorId: string;

  @ApiPropertyOptional({
    description: 'File names corresponding to each image',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileNames?: string[];
}

/**
 * Response DTO for OCR training extraction result
 */
export class OcrTrainingExtractionResult {
  @ApiProperty({ description: 'Raw text from OCR' })
  rawText: string;

  @ApiProperty({ description: 'Extracted fields with confidence scores' })
  extractedFields: Record<string, any>;

  @ApiProperty({ description: 'Field-level confidence scores (0-1)' })
  confidence: Record<string, number>;

  @ApiPropertyOptional({ description: 'File name if provided' })
  fileName?: string;

  @ApiPropertyOptional({ description: 'Processing timestamp' })
  processedAt?: Date;
}

/**
 * Response DTO for vendor OCR training history
 */
export class VendorOcrHistoryResponse {
  @ApiProperty({ description: 'Vendor details' })
  vendor: {
    id: string;
    name: string;
    displayName: string;
  };

  @ApiProperty({ description: 'Number of training samples' })
  sampleCount: number;

  @ApiProperty({ description: 'Layout patterns learned' })
  layoutPatterns: {
    fieldName: string;
    patternCount: number;
    lastUpdated: Date;
    averageConfidence: number;
  }[];

  @ApiProperty({ description: 'Recent corrections' })
  recentCorrections: {
    id: string;
    date: Date;
    correctedFields: string[];
    notes?: string;
  }[];

  @ApiProperty({ description: 'Overall training status' })
  status: 'insufficient' | 'learning' | 'active' | 'excellent';

  @ApiProperty({ description: 'Recommendation for next steps' })
  recommendation: string;
}

/**
 * Response DTO for OCR training statistics
 */
export class OcrTrainingStatsResponse {
  @ApiProperty({ description: 'Total vendors with OCR training' })
  totalVendors: number;

  @ApiProperty({ description: 'Total training samples across all vendors' })
  totalSamples: number;

  @ApiProperty({ description: 'Average samples per vendor' })
  averageSamplesPerVendor: number;

  @ApiProperty({ description: 'Vendors by status' })
  vendorsByStatus: {
    insufficient: number;
    learning: number;
    active: number;
    excellent: number;
  };

  @ApiProperty({ description: 'Top trained vendors' })
  topVendors: {
    id: string;
    name: string;
    sampleCount: number;
    accuracy: number;
  }[];

  @ApiProperty({ description: 'Field accuracy statistics' })
  fieldAccuracy: {
    fieldName: string;
    totalExtractions: number;
    correctExtractions: number;
    accuracy: number;
  }[];

  @ApiProperty({ description: 'Recent training activity (last 30 days)' })
  recentActivity: {
    date: string;
    samplesAdded: number;
    vendorsUpdated: number;
  }[];
}
