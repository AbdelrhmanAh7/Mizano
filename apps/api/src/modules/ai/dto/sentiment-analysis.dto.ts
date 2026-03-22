import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Request DTOs

export class AnalyzeTextDto {
  @ApiProperty({
    description: 'Text to analyze for sentiment',
    example: 'The product quality was excellent and delivery was fast',
  })
  @IsString()
  @MinLength(1)
  text: string;
}

// Response DTOs

export class SentimentResultDto {
  @ApiProperty({ description: 'Overall sentiment score (-5 to 5)', example: 2.3 })
  score: number;

  @ApiProperty({ description: 'Comparative score (normalized per word)', example: 0.46 })
  comparative: number;

  @ApiProperty({
    description: 'Positive words found',
    type: [String],
    example: ['excellent', 'fast'],
  })
  positive: string[];

  @ApiProperty({ description: 'Negative words found', type: [String], example: [] })
  negative: string[];

  @ApiProperty({
    description: 'Overall sentiment label',
    enum: ['positive', 'negative', 'neutral'],
    example: 'positive',
  })
  sentiment: 'positive' | 'negative' | 'neutral';
}

export class CustomerSentimentDto {
  @ApiProperty({ description: 'Customer ID' })
  customerId: string;

  @ApiProperty({
    description: 'Overall sentiment label',
    enum: ['positive', 'negative', 'neutral', 'mixed'],
  })
  overallSentiment: 'positive' | 'negative' | 'neutral' | 'mixed';

  @ApiProperty({ description: 'Number of interactions analyzed', example: 15 })
  interactionCount: number;

  @ApiProperty({
    description: 'Recent sentiment trend',
    enum: ['improving', 'declining', 'stable'],
    example: 'improving',
  })
  recentTrend: 'improving' | 'declining' | 'stable';
}

export class SentimentTrendDto {
  @ApiProperty({ description: 'Time period label', example: '2024-Q1' })
  period: string;

  @ApiProperty({ description: 'Average sentiment score for the period', example: 1.8 })
  avgScore: number;

  @ApiProperty({ description: 'Number of interactions in the period', example: 42 })
  count: number;
}
