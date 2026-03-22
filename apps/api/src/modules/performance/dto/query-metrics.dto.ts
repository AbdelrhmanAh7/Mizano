import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryMetricsQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Minimum duration in ms to filter slow queries' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  threshold?: number;

  @ApiPropertyOptional({ description: 'Filter by Prisma model name' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Filter by Prisma action (findMany, create, etc.)' })
  @IsOptional()
  @IsString()
  action?: string;
}

export class TimeTrendQueryDto {
  @ApiPropertyOptional({ description: 'Bucket interval in minutes', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  interval?: number = 5;
}

// Response DTOs
export class QueryMetricEntryDto {
  @ApiProperty()
  model!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty({ description: 'Duration in milliseconds' })
  duration!: number;

  @ApiProperty()
  timestamp!: Date;

  @ApiProperty()
  isSlow!: boolean;
}

export class QueryStatsResponseDto {
  @ApiProperty()
  totalQueries!: number;

  @ApiProperty()
  avgDuration!: number;

  @ApiProperty()
  slowQueryCount!: number;

  @ApiProperty()
  p50!: number;

  @ApiProperty()
  p95!: number;

  @ApiProperty()
  p99!: number;

  @ApiProperty()
  bufferSize!: number;
}

export class QueryDistributionItemDto {
  @ApiProperty()
  model!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  avgDuration!: number;
}

export class TimeTrendItemDto {
  @ApiProperty()
  bucket!: string;

  @ApiProperty()
  avgDuration!: number;

  @ApiProperty()
  count!: number;
}

export class DatabaseHealthDto {
  @ApiProperty({ enum: ['healthy', 'unhealthy'] })
  status!: 'healthy' | 'unhealthy';

  @ApiProperty()
  primaryConnected!: boolean;

  @ApiProperty()
  replicaConfigured!: boolean;

  @ApiProperty()
  replicaConnected!: boolean;

  @ApiProperty()
  poolSize!: number;

  @ApiProperty()
  uptimeSeconds!: number;

  @ApiProperty()
  primaryLatencyMs!: number;

  @ApiPropertyOptional()
  replicaLatencyMs?: number;
}

export class IndexRecommendationDto {
  @ApiProperty()
  table!: string;

  @ApiProperty({ type: [String] })
  columns!: string[];

  @ApiProperty()
  reason!: string;

  @ApiProperty({ description: 'Impact score (higher = more impactful)' })
  estimatedImpact!: number;

  @ApiProperty()
  suggestedSQL!: string;
}
