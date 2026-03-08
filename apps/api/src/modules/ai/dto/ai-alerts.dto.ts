import { IsString, IsOptional, IsBoolean, IsEnum, Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertCategory, AlertPriority, AlertSource } from '@prisma/client';

// ============ Query DTOs ============

export class AlertQueryDto {
  @ApiPropertyOptional({ enum: AlertCategory })
  @IsOptional()
  @IsEnum(AlertCategory)
  category?: AlertCategory;

  @ApiPropertyOptional({ enum: AlertPriority })
  @IsOptional()
  @IsEnum(AlertPriority)
  priority?: AlertPriority;

  @ApiPropertyOptional({ enum: AlertSource })
  @IsOptional()
  @IsEnum(AlertSource)
  source?: AlertSource;

  @ApiPropertyOptional({ description: 'Filter by read status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Include dismissed alerts', default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeDismissed?: boolean;

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

export class AlertLimitDto {
  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

// ============ Action DTOs ============

export class DismissAlertDto {
  @ApiPropertyOptional({ description: 'Reason for dismissing the alert' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordActionDto {
  @ApiProperty({ description: 'Action taken on the alert' })
  @IsString()
  action: string;
}

export class MarkAllReadDto {
  @ApiPropertyOptional({ enum: AlertCategory, description: 'Only mark alerts from this category' })
  @IsOptional()
  @IsEnum(AlertCategory)
  category?: AlertCategory;
}

// ============ Response DTOs ============

export class SourceEntityResponse {
  @ApiProperty()
  type: string;

  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  name?: string;
}

export class UnifiedAlertResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: AlertCategory })
  category: AlertCategory;

  @ApiProperty({ enum: AlertPriority })
  priority: AlertPriority;

  @ApiProperty({ enum: AlertSource })
  source: AlertSource;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  impact?: string;

  @ApiPropertyOptional()
  suggestedAction?: string;

  @ApiPropertyOptional()
  actionUrl?: string;

  @ApiPropertyOptional()
  actionLabel?: string;

  @ApiPropertyOptional({ type: SourceEntityResponse })
  sourceEntity?: SourceEntityResponse;

  @ApiPropertyOptional()
  data?: Record<string, unknown>;

  @ApiPropertyOptional()
  confidence?: number;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty()
  isDismissed: boolean;
}

export class AlertListResponse {
  @ApiProperty({ type: [UnifiedAlertResponse] })
  data: UnifiedAlertResponse[];

  @ApiProperty()
  total: number;
}

export class CategoryCountResponse {
  @ApiProperty()
  FINANCIAL: number;

  @ApiProperty()
  COLLECTION: number;

  @ApiProperty()
  INVENTORY: number;

  @ApiProperty()
  COMPLIANCE: number;

  @ApiProperty()
  HR: number;

  @ApiProperty()
  CRM: number;
}

export class PriorityCountResponse {
  @ApiProperty()
  CRITICAL: number;

  @ApiProperty()
  HIGH: number;

  @ApiProperty()
  MEDIUM: number;

  @ApiProperty()
  LOW: number;
}

export class AlertSummaryResponse {
  @ApiProperty()
  total: number;

  @ApiProperty()
  unread: number;

  @ApiProperty({ type: CategoryCountResponse })
  byCategory: CategoryCountResponse;

  @ApiProperty({ type: PriorityCountResponse })
  byPriority: PriorityCountResponse;

  @ApiProperty({ type: [UnifiedAlertResponse] })
  critical: UnifiedAlertResponse[];
}

export class AggregateResultResponse {
  @ApiProperty()
  created: number;

  @ApiProperty()
  updated: number;

  @ApiProperty()
  expired: number;
}

export class MarkReadResultResponse {
  @ApiProperty()
  count: number;
}
