import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaxType } from '@prisma/client';

export class CreateTaxRateDto {
  @ApiProperty({ example: 'Standard Rate (15%)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: '15' })
  @IsString()
  @IsNotEmpty()
  rate: string;

  @ApiProperty({ required: false, enum: TaxType, default: TaxType.BOTH })
  @IsEnum(TaxType)
  @IsOptional()
  type?: TaxType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  linkedAccountId: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  collectAccountId?: string;
}
