import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PatternStatus, RecurringFrequency } from '@prisma/client';

// ============ Query DTOs ============

export class PatternQueryDto {
  @ApiPropertyOptional({ enum: PatternStatus })
  @IsOptional()
  @IsEnum(PatternStatus)
  status?: PatternStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityName?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}

export class SuggestionLimitDto {
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

// ============ Action DTOs ============

export class CheckDuplicateDto {
  @ApiProperty({ description: 'Entity name (vendor/customer/account)' })
  @IsString()
  entityName: string;

  @ApiProperty({ description: 'Transaction amount' })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Transaction date' })
  @IsDateString()
  date: string;
}

export class AcceptSuggestionDto {
  @ApiPropertyOptional({ description: 'Auto-post generated transactions' })
  @IsOptional()
  @IsBoolean()
  autoPost?: boolean;

  @ApiPropertyOptional({ description: 'Custom name for recurring profile' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class DismissSuggestionDto {
  @ApiPropertyOptional({ description: 'Reason for dismissing' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordTransactionDto {
  @ApiProperty({ enum: ['journal', 'expense', 'bank_transaction'] })
  @IsString()
  sourceType: 'journal' | 'expense' | 'bank_transaction';

  @ApiProperty({ description: 'ID of the source record' })
  @IsString()
  sourceId: string;

  @ApiProperty({ enum: ['vendor', 'customer', 'account'] })
  @IsString()
  entityType: 'vendor' | 'customer' | 'account';

  @ApiProperty({ description: 'Name of the entity' })
  @IsString()
  entityName: string;

  @ApiPropertyOptional({ description: 'ID of the entity' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiProperty({ description: 'Transaction amount' })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Transaction date' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Transaction description' })
  @IsOptional()
  @IsString()
  description?: string;
}

// ============ Response DTOs ============

export class PatternOccurrenceResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sourceType: string;

  @ApiProperty()
  sourceId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  date: string;

  @ApiPropertyOptional()
  description?: string;
}

export class PatternSuggestionResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  patternId: string;

  @ApiProperty()
  suggestionType: string;

  @ApiPropertyOptional({ enum: RecurringFrequency })
  suggestedFrequency?: RecurringFrequency;

  @ApiProperty()
  suggestedAmount: number;

  @ApiProperty()
  confidence: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: string;
}

export class TransactionPatternResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  entityType: string;

  @ApiPropertyOptional()
  entityId?: string;

  @ApiProperty()
  entityName: string;

  @ApiProperty()
  amountCluster: number;

  @ApiPropertyOptional({ enum: RecurringFrequency })
  frequency?: RecurringFrequency;

  @ApiPropertyOptional()
  frequencyDays?: number;

  @ApiProperty()
  occurrenceCount: number;

  @ApiProperty()
  firstOccurrence: string;

  @ApiProperty()
  lastOccurrence: string;

  @ApiPropertyOptional()
  descriptionPattern?: string;

  @ApiProperty()
  confidence: number;

  @ApiProperty({ enum: PatternStatus })
  status: PatternStatus;

  @ApiProperty({ type: [PatternOccurrenceResponse] })
  occurrences: PatternOccurrenceResponse[];

  @ApiProperty({ type: [PatternSuggestionResponse] })
  suggestions: PatternSuggestionResponse[];
}

export class PatternListResponse {
  @ApiProperty({ type: [TransactionPatternResponse] })
  data: TransactionPatternResponse[];

  @ApiProperty()
  total: number;
}

export class DuplicateCheckResponse {
  @ApiProperty()
  isDuplicate: boolean;

  @ApiPropertyOptional()
  matchingTransaction?: {
    id: string;
    sourceType: string;
    date: string;
    amount: number;
    description?: string;
  };

  @ApiProperty()
  confidence: number;

  @ApiPropertyOptional()
  warning?: string;
}

export class RecordTransactionResponse {
  @ApiPropertyOptional()
  patternId?: string;

  @ApiProperty()
  isDuplicate: boolean;

  @ApiPropertyOptional()
  duplicateWarning?: string;
}

export class AcceptSuggestionResponse {
  @ApiProperty()
  recurringProfileId: string;
}

export class AnalysisResultResponse {
  @ApiProperty()
  patternsDetected: number;

  @ApiProperty()
  patternsUpdated: number;

  @ApiProperty()
  suggestionsCreated: number;

  @ApiProperty()
  duplicatesFound: number;
}

export class FrequencyAnalysisResponse {
  @ApiPropertyOptional({ enum: RecurringFrequency })
  frequency?: RecurringFrequency;

  @ApiProperty()
  interval: number;

  @ApiProperty()
  stdDev: number;

  @ApiProperty()
  confidence: number;

  @ApiPropertyOptional()
  patternType?: string;
}

export class PatternDetailsResponse extends TransactionPatternResponse {
  @ApiProperty({ type: FrequencyAnalysisResponse })
  frequencyAnalysis: FrequencyAnalysisResponse;

  @ApiPropertyOptional()
  nextExpectedDate?: string;
}
