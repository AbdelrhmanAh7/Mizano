import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Request DTOs

export class ClassifyDocumentDto {
  @ApiProperty({ description: 'Document text content to classify', example: 'Invoice #1234 from Acme Corp for office supplies' })
  @IsString()
  @MinLength(1)
  text: string;

  @ApiPropertyOptional({ description: 'Original filename for context', example: 'invoice_acme_2024.pdf' })
  @IsString()
  @IsOptional()
  filename?: string;
}

// Response DTOs

export class ClassificationScoreResponse {
  @ApiProperty({ description: 'Document category' })
  category: string;

  @ApiProperty({ description: 'Confidence score (0-1)' })
  score: number;
}

export class ClassificationResultDto {
  @ApiProperty({ description: 'Predicted document category', example: 'invoice' })
  category: string;

  @ApiProperty({ description: 'Confidence score (0-1)', example: 0.92 })
  confidence: number;

  @ApiProperty({
    description: 'Scores for all categories',
    type: [ClassificationScoreResponse],
  })
  scores: ClassificationScoreResponse[];
}

export class ModelStatusDto {
  @ApiProperty({ description: 'AI feature name', example: 'document_classification' })
  feature: string;

  @ApiProperty({ description: 'Model version', example: 3 })
  version: number;

  @ApiProperty({ description: 'Model accuracy (0-1)', example: 0.87 })
  accuracy: number;

  @ApiProperty({ description: 'Last training timestamp', nullable: true })
  trainedAt: string | null;

  @ApiProperty({ description: 'Number of training samples used', example: 500 })
  sampleCount: number;
}
