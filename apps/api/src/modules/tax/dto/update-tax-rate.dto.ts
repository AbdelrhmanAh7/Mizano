import { IsString, IsOptional, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaxType } from '@prisma/client';

export class UpdateTaxRateDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  rate?: string;

  @ApiProperty({ required: false, enum: TaxType })
  @IsEnum(TaxType)
  @IsOptional()
  type?: TaxType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  linkedAccountId?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  collectAccountId?: string;
}
