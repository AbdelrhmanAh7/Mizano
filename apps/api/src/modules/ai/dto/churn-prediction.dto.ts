import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ChurnLimitDto {
  @ApiPropertyOptional({ description: 'Maximum number of results' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
