import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateTrainingDataDto {
  @ApiPropertyOptional({
    description: 'Number of training samples to generate',
    minimum: 10,
    maximum: 500,
    default: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  count?: number = 100;
}
