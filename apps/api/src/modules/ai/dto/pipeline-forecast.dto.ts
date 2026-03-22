import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PipelineForecastQueryDto {
  @ApiPropertyOptional({ description: 'Number of months to forecast' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  months?: number;
}
