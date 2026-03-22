import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ClvQueryDto {
  @ApiPropertyOptional({ description: 'Filter by segment' })
  @IsOptional()
  @IsString()
  segment?: string;
}
