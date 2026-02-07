import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PricingQueryDto {
  @ApiPropertyOptional({ description: 'Target profit margin (0-1)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  targetMargin?: number;
}
