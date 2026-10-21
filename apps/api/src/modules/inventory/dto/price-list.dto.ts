import { ApiProperty } from '@nestjs/swagger';
import { PriceListType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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
import { IsDecimalString } from '../../../common/dto/decimal-string';

/** `PriceList.adjustment` is Decimal(10, 4): signed (a discount is negative), 6 integer digits at most. */
const SIGNED_ADJUSTMENT = /^-?\d{1,6}(\.\d{1,4})?$/;
const adjustmentRule = (): PropertyDecorator =>
  Matches(SIGNED_ADJUSTMENT, {
    message: 'adjustment must be a decimal string with at most 6 integer and 4 decimal places',
  });

export class PriceListItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: '90.00' })
  @IsDecimalString()
  customPrice: string;
}

export class CreatePriceListDto {
  @ApiProperty({ example: 'VIP Customer Pricing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: PriceListType })
  @IsEnum(PriceListType)
  type: PriceListType;

  @ApiProperty({ example: '-10', description: 'Percentage or fixed amount, see type' })
  @adjustmentRule()
  adjustment: string;

  @ApiProperty({ required: false, type: [PriceListItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceListItemDto)
  items?: PriceListItemDto[];
}

export class UpdatePriceListDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, enum: PriceListType })
  @IsOptional()
  @IsEnum(PriceListType)
  type?: PriceListType;

  @ApiProperty({ required: false })
  @IsOptional()
  @adjustmentRule()
  adjustment?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
