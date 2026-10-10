import { IsString, IsNumber, IsOptional, IsEnum, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetType, DepreciationMethod, AssetStatus } from '@prisma/client';

// ============ Query DTOs ============

export class AssetQueryDto {
  @ApiPropertyOptional({ enum: AssetStatus })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @ApiPropertyOptional({ enum: AssetType })
  @IsOptional()
  @IsEnum(AssetType)
  assetType?: AssetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}

// ============ Create/Update DTOs ============

export class CreateAssetDto {
  @ApiProperty({ description: 'Asset name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Asset description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AssetType })
  @IsEnum(AssetType)
  assetType: AssetType;

  @ApiProperty({ description: 'Purchase date' })
  @IsDateString()
  purchaseDate: string;

  @ApiProperty({ description: 'Purchase price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @ApiProperty({ description: 'Salvage value at end of useful life' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salvageValue: number;

  @ApiProperty({ description: 'Useful life in years' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  usefulLifeYears: number;

  @ApiPropertyOptional({ enum: DepreciationMethod, default: 'STRAIGHT_LINE' })
  @IsOptional()
  @IsEnum(DepreciationMethod)
  depreciationMethod?: DepreciationMethod = DepreciationMethod.STRAIGHT_LINE;

  @ApiProperty({ description: 'Asset account ID (Fixed Asset account)' })
  @IsString()
  assetAccountId: string;

  @ApiProperty({ description: 'Depreciation expense account ID' })
  @IsString()
  depreciationAccountId: string;

  @ApiProperty({ description: 'Accumulated depreciation account ID' })
  @IsString()
  accumulatedDeprAccountId: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional({ description: 'Asset name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Asset description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Salvage value' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salvageValue?: number;

  @ApiPropertyOptional({ description: 'Useful life in years' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  usefulLifeYears?: number;
}

export class DisposeAssetDto {
  @ApiProperty({ description: 'Disposal date' })
  @IsDateString()
  disposalDate: string;

  @ApiProperty({ description: 'Disposal amount received' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  disposalAmount: number;
}

// ============ Response DTOs ============

export class DepreciationScheduleResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  month: number;

  @ApiProperty()
  year: number;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  accumulatedTotal: number;

  @ApiProperty()
  bookValue: number;

  @ApiPropertyOptional()
  journalId?: string;

  @ApiPropertyOptional()
  executedAt?: Date;
}

export class AssetResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  assetNumber: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: AssetType })
  assetType: AssetType;

  @ApiProperty()
  purchaseDate: Date;

  @ApiProperty()
  purchasePrice: number;

  @ApiProperty()
  salvageValue: number;

  @ApiProperty()
  usefulLifeYears: number;

  @ApiProperty({ enum: DepreciationMethod })
  depreciationMethod: DepreciationMethod;

  @ApiProperty()
  monthlyDepreciation: number;

  @ApiProperty()
  accumulatedDepreciation: number;

  @ApiProperty()
  currentBookValue: number;

  @ApiProperty({ enum: AssetStatus })
  status: AssetStatus;

  @ApiPropertyOptional()
  disposalDate?: Date;

  @ApiPropertyOptional()
  disposalAmount?: number;

  @ApiPropertyOptional()
  disposalGainLoss?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class AssetDetailResponse extends AssetResponse {
  @ApiProperty({ type: [DepreciationScheduleResponse] })
  depreciationSchedule: DepreciationScheduleResponse[];

  @ApiPropertyOptional()
  assetAccount?: {
    id: string;
    name: string;
    code: string;
  };

  @ApiPropertyOptional()
  depreciationAccount?: {
    id: string;
    name: string;
    code: string;
  };

  @ApiPropertyOptional()
  accumulatedDeprAccount?: {
    id: string;
    name: string;
    code: string;
  };
}

export class AssetListResponse {
  @ApiProperty({ type: [AssetResponse] })
  data: AssetResponse[];

  @ApiProperty()
  total: number;
}

export class DepreciationRunResponse {
  @ApiProperty()
  processed: number;

  @ApiProperty()
  journalsCreated: number;

  @ApiProperty()
  totalDepreciation: string;
}

export class AssetSummaryResponse {
  @ApiProperty()
  totalAssets: number;

  @ApiProperty()
  activeAssets: number;

  @ApiProperty()
  totalPurchaseValue: number;

  @ApiProperty()
  totalBookValue: number;

  @ApiProperty()
  totalAccumulatedDepreciation: number;

  @ApiProperty()
  monthlyDepreciation: number;

  @ApiProperty()
  byType: Record<string, number>;
}
