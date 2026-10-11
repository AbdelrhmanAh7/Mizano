import { IsString, IsOptional, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaxType } from '@prisma/client';
import { IsDecimalString } from '../../../common/dto/decimal-string';

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

  @ApiProperty({ required: false, description: 'VAT percentage (15 => 15%), at most 2 decimals' })
  @IsString()
  @IsOptional()
  @IsDecimalString(2)
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
