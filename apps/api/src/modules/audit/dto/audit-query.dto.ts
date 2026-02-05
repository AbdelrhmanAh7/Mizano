import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from '@prisma/client';

export class AuditQueryDto {
  @ApiProperty({
    description: 'Page number',
    default: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    description: 'Items per page',
    default: 20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by entity type (e.g., customers, invoices, users)',
    required: false,
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiProperty({
    description: 'Filter by entity ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiProperty({
    description: 'Filter by user who made the change',
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({
    description: 'Filter by action type',
    enum: AuditAction,
    required: false,
  })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiProperty({
    description: 'Start date for filtering (ISO 8601 format)',
    required: false,
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'End date for filtering (ISO 8601 format)',
    required: false,
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Search in entity type or entity ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Sort by field',
    default: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
    required: false,
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
