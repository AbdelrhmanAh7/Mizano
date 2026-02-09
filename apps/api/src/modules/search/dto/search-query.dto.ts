import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/** Valid entity types for search filtering */
export const SEARCH_ENTITY_TYPES = [
  'customer',
  'vendor',
  'invoice',
  'bill',
  'item',
  'employee',
  'project',
  'lead',
  'deal',
  'quote',
  'expense',
] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export class GlobalSearchQueryDto {
  @ApiProperty({
    description: 'Search query string (min 2 characters)',
    example: 'invoice',
    minLength: 2,
  })
  @IsString()
  @MinLength(2)
  q!: string;

  @ApiPropertyOptional({
    description: 'Maximum total results to return (default 25)',
    example: 25,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 25;

  @ApiPropertyOptional({
    description: 'Filter results to specific entity types',
    example: ['customer', 'invoice'],
    enum: SEARCH_ENTITY_TYPES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(SEARCH_ENTITY_TYPES, { each: true })
  types?: SearchEntityType[];

  @ApiPropertyOptional({
    description: 'Fuzzy matching threshold (0.0 = loose, 1.0 = exact). Default 0.3',
    example: 0.3,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  fuzzyThreshold?: number = 0.3;
}
