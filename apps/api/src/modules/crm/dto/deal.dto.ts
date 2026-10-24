import { PartialType } from '@nestjs/swagger';
import { DealStage } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * These were TypeScript interfaces, which erase at runtime: the global
 * ValidationPipe saw `Object` and validated nothing, so a deal without an amount
 * or with a made-up stage was accepted. Classes with decorators make it enforce.
 */
export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  dealName: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  @IsNumber()
  @Min(0)
  expectedAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsISO8601()
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDealDto extends PartialType(CreateDealDto) {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lostReason?: string;
}

export class UpdateDealStageDto {
  @IsEnum(DealStage)
  stage: DealStage;
}
