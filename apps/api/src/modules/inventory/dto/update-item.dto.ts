import { IsString, IsOptional, IsEnum, IsInt, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';

export class UpdateItemDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  sku?: string;

  @ApiProperty({ required: false, enum: ItemType })
  @IsEnum(ItemType)
  @IsOptional()
  type?: ItemType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unit?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  sellingPrice?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  salesAccountId?: string;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
