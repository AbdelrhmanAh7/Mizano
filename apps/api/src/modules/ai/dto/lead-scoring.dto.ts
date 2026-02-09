import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { LeadTier } from '@prisma/client';

export class LeadLimitDto {
  @ApiPropertyOptional({
    description: 'Maximum number of leads to return',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// Response DTOs
export class ScoreBreakdownResponse {
  @ApiProperty({ description: 'Category name' })
  category: string;

  @ApiProperty({ description: 'Rule description' })
  rule: string;

  @ApiProperty({ description: 'Field name' })
  field: string;

  @ApiProperty({ description: 'Score awarded' })
  score: number;

  @ApiProperty({ description: 'Maximum possible score' })
  maxScore: number;
}

export class LeadScoreResponse {
  @ApiProperty({ description: 'Total score (0-100)' })
  totalScore: number;

  @ApiProperty({ description: 'Demographic score (0-40)' })
  demographicScore: number;

  @ApiProperty({ description: 'Behavioral score (0-40)' })
  behavioralScore: number;

  @ApiProperty({ description: 'Engagement score (0-20)' })
  engagementScore: number;

  @ApiProperty({
    description: 'Lead tier',
    enum: ['HOT', 'WARM', 'COOL', 'COLD'],
  })
  tier: LeadTier;

  @ApiProperty({ description: 'Estimated conversion probability (0-1)' })
  conversionProbability: number;

  @ApiProperty({ type: [ScoreBreakdownResponse] })
  breakdown: ScoreBreakdownResponse[];

  @ApiProperty({
    description: 'Prediction method used',
    enum: ['ML', 'RULE_BASED', 'HYBRID'],
  })
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export class HotLeadResponse {
  @ApiProperty({ description: 'Lead ID' })
  leadId: string;

  @ApiProperty({ description: 'Lead name' })
  leadName: string;

  @ApiProperty({ description: 'Company name' })
  company: string | null;

  @ApiProperty({ description: 'Total score' })
  score: number;

  @ApiProperty({ enum: ['HOT', 'WARM', 'COOL', 'COLD'] })
  tier: LeadTier;

  @ApiProperty({ description: 'Conversion probability' })
  conversionProbability: number;

  @ApiProperty({ description: 'Last activity date' })
  lastActivity: Date | null;

  @ApiProperty({ description: 'Recommended action' })
  recommendedAction: string;
}

export class ColdLeadResponse {
  @ApiProperty({ description: 'Lead ID' })
  leadId: string;

  @ApiProperty({ description: 'Lead name' })
  leadName: string;

  @ApiProperty({ description: 'Current score' })
  score: number;

  @ApiProperty({ description: 'Days since last activity' })
  daysInactive: number;

  @ApiProperty({ description: 'Re-engagement suggestion' })
  reengagementSuggestion: string;
}

export class ConversionPredictionResponse {
  @ApiProperty({ description: 'Conversion probability' })
  probability: number;

  @ApiProperty({
    description: 'Confidence level',
    enum: ['high', 'medium', 'low'],
  })
  confidence: 'high' | 'medium' | 'low';

  @ApiProperty({ description: 'Factors affecting conversion' })
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }>;

  @ApiProperty({ description: 'Recommended action' })
  recommendation: string;
}

export class ScoreHistoryEntryResponse {
  @ApiProperty({ description: 'Date of score change' })
  date: Date;

  @ApiProperty({ description: 'Score at this date' })
  score: number;

  @ApiProperty({ description: 'Score change from previous' })
  change: number;

  @ApiProperty({ description: 'Reason for change' })
  reason: string;
}

export class ScoreAllResultResponse {
  @ApiProperty({ description: 'Number of leads processed' })
  processed: number;

  @ApiProperty({ description: 'Score distribution by tier' })
  byTier: {
    hot: number;
    warm: number;
    cool: number;
    cold: number;
  };
}

export class UpdateScoresResultResponse {
  @ApiProperty({ description: 'Number of scores updated' })
  updated: number;

  @ApiProperty({ description: 'Number of scores that decayed' })
  decayed: number;
}

export class ScoreDistributionResponse {
  @ApiProperty({ description: 'Distribution by tier' })
  byTier: Array<{
    tier: LeadTier;
    count: number;
    percentage: number;
  }>;

  @ApiProperty({ description: 'Average score' })
  avgScore: number;

  @ApiProperty({ description: 'Median score' })
  medianScore: number;
}
