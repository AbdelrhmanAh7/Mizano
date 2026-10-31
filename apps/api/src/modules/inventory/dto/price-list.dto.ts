import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PriceListType } from '@prisma/client';
import { IsDecimalString } from '../../../common/dto/decimal-string';

/**
 * Decimal(10, 4): a markup (positive) or markdown (negative) of at most 6 integer digits.
 * A string, like every other amount, so nothing is rounded on the way in.
 */
const ADJUSTMENT_PATTERN = /^-?\d{1,6}(\.\d{1,4})?$/;
const ADJUSTMENT_MESSAGE =
  'adjustment must be a decimal string with at most 6 integer digits and 4 decimal places';

export class PriceListItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: '95.00' })
  @IsString()
  @IsDecimalString()
  customPrice: string;
}

export class CreatePriceListDto {
  @ApiProperty({ example: 'Wholesale' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: PriceListType })
  @IsEnum(PriceListType)
  type: PriceListType;

  @ApiProperty({ example: '-10' })
  @IsString()
  @Matches(ADJUSTMENT_PATTERN, { message: ADJUSTMENT_MESSAGE })
  adjustment: string;

  @ApiProperty({ required: false, type: [PriceListItemDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PriceListItemDto)
  @IsOptional()
  items?: PriceListItemDto[];
}

export class UpdatePriceListDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, enum: PriceListType })
  @IsEnum(PriceListType)
  @IsOptional()
  type?: PriceListType;

  @ApiProperty({ required: false })
  @IsString()
  @Matches(ADJUSTMENT_PATTERN, { message: ADJUSTMENT_MESSAGE })
  @IsOptional()
  adjustment?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
