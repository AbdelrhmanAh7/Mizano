import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TransactionDirection {
  EXPENSE = 'expense',
  INCOME = 'income',
}

export class PredictCategorizationDto {
  @ApiProperty({ description: 'Transaction description', example: 'Office supplies from Staples' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiPropertyOptional({ description: 'Vendor name', example: 'Staples' })
  @IsString()
  @IsOptional()
  vendorName?: string;

  @ApiProperty({ description: 'Transaction amount', example: 150.00 })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: TransactionDirection, description: 'Transaction direction' })
  @IsEnum(TransactionDirection)
  direction: TransactionDirection;
}

export class LearnCategorizationDto {
  @ApiProperty({ description: 'Transaction description' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiPropertyOptional({ description: 'Vendor name' })
  @IsString()
  @IsOptional()
  vendorName?: string;

  @ApiProperty({ description: 'Transaction amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: TransactionDirection, description: 'Transaction direction' })
  @IsEnum(TransactionDirection)
  direction: TransactionDirection;

  @ApiProperty({ description: 'Selected account ID' })
  @IsString()
  selectedAccountId: string;

  @ApiProperty({ description: 'Whether AI suggestion was shown' })
  @IsBoolean()
  wasAiSuggested: boolean;

  @ApiPropertyOptional({ description: 'AI suggested account ID (if suggestion was shown)' })
  @IsString()
  @IsOptional()
  aiSuggestedAccountId?: string;
}

export class CategorizationPredictionResponse {
  @ApiProperty({ description: 'Predicted account ID', nullable: true })
  accountId: string | null;

  @ApiProperty({ description: 'Account code' })
  accountCode: string;

  @ApiProperty({ description: 'Account name' })
  accountName: string;

  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence: number;

  @ApiProperty({ description: 'Prediction ID for feedback' })
  predictionId: string;

  @ApiProperty({
    description: 'Alternative suggestions',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        accountId: { type: 'string' },
        accountCode: { type: 'string' },
        accountName: { type: 'string' },
        confidence: { type: 'number' },
      },
    },
  })
  alternatives: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    confidence: number;
  }>;

  @ApiProperty({
    description: 'Prediction method used',
    enum: ['ML', 'RULE_BASED', 'HYBRID'],
  })
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export class CategorizationStatsResponse {
  @ApiProperty({ description: 'Number of training samples' })
  sampleCount: number;

  @ApiProperty({ description: 'Model accuracy (0-1)' })
  accuracy: number;

  @ApiProperty({ description: 'Current model version' })
  version: number;

  @ApiProperty({ description: 'Last training timestamp', nullable: true })
  lastTrainedAt: string | null;

  @ApiProperty({ description: 'Whether retraining is needed' })
  needsRetraining: boolean;
}

export class TrainCategorizationResponse {
  @ApiProperty({ description: 'New model version' })
  version: number;

  @ApiProperty({ description: 'Model accuracy after training' })
  accuracy: number;

  @ApiProperty({ description: 'Number of samples used for training' })
  sampleCount: number;
}

export class SeedCategorizationResponse {
  @ApiProperty({ description: 'Number of records seeded' })
  seeded: number;
}
