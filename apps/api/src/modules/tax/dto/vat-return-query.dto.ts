import { ApiProperty } from '@nestjs/swagger';
import { VATReturnStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class VatReturnQueryDto {
  @ApiProperty({ required: false, enum: VATReturnStatus })
  @IsOptional()
  @IsEnum(VATReturnStatus)
  status?: VATReturnStatus;

  @ApiProperty({ required: false, example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(2200)
  year?: number;
}
