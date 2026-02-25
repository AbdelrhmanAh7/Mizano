import { IsOptional, IsBoolean, IsArray, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RunDeepSearchDto {
  @ApiPropertyOptional({ description: 'Skip web scraping (codebase-only mode)', default: false })
  @IsOptional()
  @IsBoolean()
  skipWeb?: boolean = false;

  @ApiPropertyOptional({
    description: 'Filter suggestion categories',
    enum: ['FEATURE_GAP', 'PERFORMANCE_UX', 'AI_CAPABILITY'],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  categories?: string[];

  @ApiPropertyOptional({
    description: 'Maximum number of suggestions to generate',
    minimum: 1,
    maximum: 30,
    default: 15,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  maxSuggestions?: number = 15;
}

export class UpdateSuggestionStatusDto {
  @IsIn(['accepted', 'dismissed'])
  status: string;
}
