import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';

export class CreateItemDto {
  @ApiProperty({ example: 'Product Name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sku: string;

  @ApiProperty({ enum: ItemType })
  @IsEnum(ItemType)
  type: ItemType;

  @ApiProperty({ required: false, example: 'pcs' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unit?: string;

  @ApiProperty({ example: '100.00' })
  @IsString()
  @IsNotEmpty()
  sellingPrice: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  salesAccountId?: string;

  @ApiProperty({ required: false, default: '0', example: '50.00' })
  @IsString()
  @IsOptional()
  costPrice?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  purchaseAccountId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  inventoryAccountId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  reorderPoint?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsInt()
  @IsOptional()
  openingStock?: number;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
