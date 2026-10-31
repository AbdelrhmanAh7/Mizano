import { ApiProperty, PartialType } from '@nestjs/swagger';
import { DealStage } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CrmListQueryDto } from './crm-list-query.dto';
import { IsDecimalString } from '../../../common/dto/decimal-string';
import { IsStrictBoolean } from '../../../common/dto/strict-boolean';

/**
 * These were TypeScript interfaces, which erase at runtime: the global
 * ValidationPipe saw `Object` and validated nothing, so a deal without an amount
 * or with a made-up stage was accepted. Classes with decorators make it enforce.
 */
export class CreateDealDto {
  @ApiProperty({ example: 'Website redesign' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  dealName: string;

  @ApiProperty({ required: false, description: 'A live lead of the same organization' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  leadId?: string;

  @ApiProperty({ required: false, description: 'A live customer of the same organization' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @ApiProperty({ required: false, enum: DealStage })
  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  /** Decimal(19, 4), transported as a string like every other amount. */
  @ApiProperty({ example: '5000.00' })
  @IsString()
  @IsDecimalString()
  expectedAmount: string;

  /** A whole percentage: the column is an integer. */
  @ApiProperty({ required: false, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsOptional()
  @IsISO8601()
  expectedCloseDate?: string;

  @ApiProperty({ required: false, description: 'A user of the same organization' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDealDto extends PartialType(CreateDealDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lostReason?: string;
}

export class UpdateDealStageDto {
  @ApiProperty({ enum: DealStage })
  @IsEnum(DealStage)
  stage: DealStage;
}

export class MarkDealWonDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsStrictBoolean()
  createQuote?: boolean;
}

export class MarkDealLostDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DealQueryDto extends CrmListQueryDto {
  @ApiProperty({ required: false, enum: DealStage })
  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;
}
