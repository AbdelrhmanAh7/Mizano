import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaxType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class TaxRateQueryDto {
  @ApiProperty({ required: false, enum: TaxType })
  @IsEnum(TaxType)
  @IsOptional()
  type?: TaxType;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
