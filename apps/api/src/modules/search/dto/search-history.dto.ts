import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RecordSearchHistoryDto {
  @ApiProperty({ description: 'The search query string', example: 'customer name' })
  @IsString()
  @MinLength(1)
  query!: string;

  @ApiPropertyOptional({ description: 'Entity type of clicked result', example: 'customer' })
  @IsOptional()
  @IsString()
  resultType?: string;

  @ApiPropertyOptional({ description: 'ID of the clicked result' })
  @IsOptional()
  @IsString()
  resultId?: string;

  @ApiPropertyOptional({
    description: 'Display title of the clicked result',
    example: 'Acme Corp',
  })
  @IsOptional()
  @IsString()
  resultTitle?: string;
}

export class SearchHistoryItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  query!: string;

  @ApiPropertyOptional()
  resultType?: string | null;

  @ApiPropertyOptional()
  resultId?: string | null;

  @ApiPropertyOptional()
  resultTitle?: string | null;

  @ApiProperty()
  clickedAt!: Date;
}

export class SearchHistoryResponseDto {
  @ApiProperty({ type: [SearchHistoryItemDto] })
  data!: SearchHistoryItemDto[];
}
