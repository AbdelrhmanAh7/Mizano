import { ApiProperty } from '@nestjs/swagger';
import { AdjustmentReason, AdjustmentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * One adjustment changes the stock of one item in one warehouse and posts one journal for the
 * value of the change (quantity x item cost price) against `accountId`.
 */
export class CreateAdjustmentDto {
  @ApiProperty({ example: '2026-03-31', description: 'Adjustment date; also the journal date' })
  @IsDateString()
  date: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ enum: AdjustmentType })
  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  @ApiProperty({ example: 5, description: 'Whole units, at least 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @ApiProperty({ enum: AdjustmentReason })
  @IsEnum(AdjustmentReason)
  reason: AdjustmentReason;

  @ApiProperty({
    description:
      'Account that takes the other side of the entry (e.g. COGS / inventory shrinkage expense)',
  })
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
