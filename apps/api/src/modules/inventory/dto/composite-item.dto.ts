import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDecimalString } from '../../../common/dto/decimal-string';

/** The component quantity column is an integer: a bundle holds whole units of each item. */
const MAX_UNITS = 1_000_000;

/**
 * These were TypeScript interfaces, which erase at runtime: the global ValidationPipe saw
 * `Object` and validated nothing, so a fractional quantity or a missing SKU reached Prisma and
 * came back as a 500.
 */
export class CompositeItemComponentDto {
  @ApiProperty({ description: 'A live item of the same organization' })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_UNITS)
  quantity: number;
}

export class CreateCompositeItemDto {
  @ApiProperty({ example: 'Desktop bundle' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  /** Unique per organization (the column is required and unique with the organization). */
  @ApiProperty({ example: 'BNDL-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, example: '1500.00', default: '0' })
  @IsOptional()
  @IsString()
  @IsDecimalString()
  sellingPrice?: string;

  @ApiProperty({ type: [CompositeItemComponentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CompositeItemComponentDto)
  components: CompositeItemComponentDto[];
}

/** Sending `components` replaces the whole list. */
export class UpdateCompositeItemDto extends PartialType(CreateCompositeItemDto) {}

export class AssembleCompositeItemDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_UNITS)
  quantity: number;

  @ApiProperty({ description: 'A live warehouse of the same organization' })
  @IsString()
  @IsNotEmpty()
  warehouseId: string;
}

export class CompositeAvailabilityQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UNITS)
  quantity?: number;
}
