import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CrossSellLimitDto {
  @ApiPropertyOptional({ description: 'Maximum number of recommendations' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
